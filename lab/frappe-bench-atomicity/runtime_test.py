from __future__ import annotations

import argparse
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "implementations" / "python"))
sys.path.insert(0, str(ROOT / "frameworks" / "frappe"))

import frappe  # noqa: E402
from frappe.app import sync_database  # noqa: E402
from frappe.utils.background_jobs import execute_job  # noqa: E402

from auditspec import event_identity  # noqa: E402
from auditspec_frappe import FrappeAuditAdapter  # noqa: E402

BUSINESS_TABLE = "tabAuditSpecLabBusiness"
AUDIT_TABLE = "tabAuditSpecLabEvent"
OUTBOX_TABLE = "tabAuditSpecLabOutbox"

BENCH_PATH: Path | None = None
SITE_NAME: str | None = None


def canonical_json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def table_count(table: str) -> int:
    return int(frappe.db.sql(f"SELECT COUNT(*) FROM `{table}`")[0][0])


def insert_business(identifier: str, value: str = "changed") -> None:
    frappe.db.sql(
        f"INSERT INTO `{BUSINESS_TABLE}` (`id`, `value`) VALUES (%s, %s)",
        (identifier, value),
    )


def insert_event(event: dict[str, Any]) -> str:
    frappe.db.sql(
        f"INSERT INTO `{AUDIT_TABLE}` (`event_id`, `payload`) VALUES (%s, %s)",
        (event["id"], canonical_json(event)),
    )
    return str(event["id"])


def insert_outbox(identity: str, event: dict[str, Any]) -> str:
    frappe.db.sql(
        f"INSERT INTO `{OUTBOX_TABLE}` (`identity`, `payload`) VALUES (%s, %s)",
        (identity, canonical_json(event)),
    )
    return identity


class FrappeBenchAtomicityTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        assert BENCH_PATH is not None
        assert SITE_NAME is not None

        os.chdir(BENCH_PATH / "sites")

        with (ROOT / "conformance" / "valid" / "agent-action.json").open("r", encoding="utf-8") as handle:
            cls.base_event = json.load(handle)

        frappe.init(site=SITE_NAME, sites_path=str(BENCH_PATH / "sites"), force=True)
        frappe.connect()
        frappe.set_user("Administrator")

        frappe.db.sql(
            f"""
            CREATE TABLE IF NOT EXISTS `{BUSINESS_TABLE}` (
                `id` varchar(140) NOT NULL,
                `value` varchar(255) NOT NULL,
                PRIMARY KEY (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        frappe.db.sql(
            f"""
            CREATE TABLE IF NOT EXISTS `{AUDIT_TABLE}` (
                `event_id` varchar(140) NOT NULL,
                `payload` longtext NOT NULL,
                PRIMARY KEY (`event_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        frappe.db.sql(
            f"""
            CREATE TABLE IF NOT EXISTS `{OUTBOX_TABLE}` (
                `identity` varchar(512) NOT NULL,
                `payload` longtext NOT NULL,
                PRIMARY KEY (`identity`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        frappe.db.commit()

    @classmethod
    def tearDownClass(cls) -> None:
        try:
            frappe.db.rollback()
        finally:
            frappe.destroy()

    def setUp(self) -> None:
        frappe.db.rollback()
        for table in (BUSINESS_TABLE, AUDIT_TABLE, OUTBOX_TABLE):
            frappe.db.sql(f"DELETE FROM `{table}`")
        frappe.db.commit()
        frappe.local.flags.commit = False
        frappe.local.session_obj = None

    def event(self, suffix: str) -> dict[str, Any]:
        value = copy.deepcopy(self.base_event)
        value["id"] = f"aud_frappe_lab_{suffix}"
        return value

    def adapter(self, wake: Callable[[str], Any] | None = None) -> FrappeAuditAdapter:
        return FrappeAuditAdapter(
            db=frappe.db,
            insert_event=insert_event,
            insert_outbox=insert_outbox,
            wake_publisher=wake,
        )

    def preseed_audit(self, event: dict[str, Any]) -> None:
        insert_event(event)
        frappe.db.commit()

    def preseed_outbox(self, event: dict[str, Any]) -> None:
        insert_outbox(event_identity(event), event)
        frappe.db.commit()

    def reset_tables(self) -> None:
        frappe.db.rollback()
        for table in (BUSINESS_TABLE, AUDIT_TABLE, OUTBOX_TABLE):
            frappe.db.sql(f"DELETE FROM `{table}`")
        frappe.db.commit()

    def test_same_store_audit_follows_real_caller_commit_and_rollback(self) -> None:
        event = self.event("same_store")
        adapter = self.adapter()

        insert_business("rollback-business")
        adapter.emit_same_store(event)
        self.assertEqual(1, table_count(BUSINESS_TABLE))
        self.assertEqual(1, table_count(AUDIT_TABLE))

        frappe.db.rollback()
        self.assertEqual(0, table_count(BUSINESS_TABLE))
        self.assertEqual(0, table_count(AUDIT_TABLE))

        insert_business("commit-business")
        adapter.emit_same_store(event)
        frappe.db.commit()
        frappe.db.rollback()

        self.assertEqual(1, table_count(BUSINESS_TABLE))
        self.assertEqual(1, table_count(AUDIT_TABLE))

    def test_real_audit_storage_constraint_failure_can_roll_back_business_mutation(self) -> None:
        event = self.event("audit_duplicate")
        self.preseed_audit(event)
        adapter = self.adapter()

        insert_business("business-before-audit-failure")
        with self.assertRaises(Exception):
            adapter.emit_same_store(event)
        frappe.db.rollback()

        self.assertEqual(0, table_count(BUSINESS_TABLE))
        self.assertEqual(1, table_count(AUDIT_TABLE))

    def test_real_outbox_storage_constraint_failure_can_roll_back_business_mutation(self) -> None:
        event = self.event("outbox_duplicate")
        self.preseed_outbox(event)
        adapter = self.adapter()

        insert_business("business-before-outbox-failure")
        with self.assertRaises(Exception):
            adapter.stage_outbox(event)
        frappe.db.rollback()

        self.assertEqual(0, table_count(BUSINESS_TABLE))
        self.assertEqual(1, table_count(OUTBOX_TABLE))

    def test_real_after_commit_callback_runs_on_commit_and_is_cleared_on_rollback(self) -> None:
        woken: list[str] = []
        adapter = self.adapter(woken.append)

        rollback_event = self.event("callback_rollback")
        rollback_identity = adapter.stage_outbox(rollback_event)
        self.assertEqual([], woken)
        self.assertEqual(1, table_count(OUTBOX_TABLE))

        frappe.db.rollback()
        self.assertEqual([], woken)
        self.assertEqual(0, table_count(OUTBOX_TABLE))

        commit_event = self.event("callback_commit")
        commit_identity = adapter.stage_outbox(commit_event)
        self.assertEqual([], woken)

        frappe.db.commit()
        self.assertEqual([commit_identity], woken)
        self.assertNotEqual(rollback_identity, commit_identity)
        self.assertEqual(1, table_count(OUTBOX_TABLE))

    def test_frappe_request_sync_boundary_commits_unsafe_and_rolls_back_safe_methods(self) -> None:
        woken: list[str] = []
        adapter = self.adapter(woken.append)

        post_event = self.event("request_post")
        post_identity = adapter.stage_outbox(post_event)
        insert_business("request-post")
        frappe.local.request = SimpleNamespace(method="POST")
        sync_database()

        self.assertEqual([post_identity], woken)
        frappe.db.rollback()
        self.assertEqual(1, table_count(BUSINESS_TABLE))
        self.assertEqual(1, table_count(OUTBOX_TABLE))

        self.reset_tables()
        woken.clear()

        get_event = self.event("request_get")
        adapter.stage_outbox(get_event)
        insert_business("request-get")
        frappe.local.request = SimpleNamespace(method="GET")
        sync_database()

        self.assertEqual([], woken)
        self.assertEqual(0, table_count(BUSINESS_TABLE))
        self.assertEqual(0, table_count(OUTBOX_TABLE))

    def test_frappe_job_boundary_commits_successful_outbox_and_rolls_back_audit_failure(self) -> None:
        assert SITE_NAME is not None

        woken: list[str] = []
        success_event = self.event("job_success")
        success_adapter = self.adapter(woken.append)

        def successful_job() -> None:
            insert_business("job-success")
            success_adapter.stage_outbox(success_event)

        execute_job(
            site=SITE_NAME,
            method=successful_job,
            event="auditspec_runtime_lab",
            job_name="auditspec-runtime-success",
            kwargs={},
            is_async=False,
        )

        success_identity = event_identity(success_event)
        self.assertEqual([success_identity], woken)
        frappe.db.rollback()
        self.assertEqual(1, table_count(BUSINESS_TABLE))
        self.assertEqual(1, table_count(OUTBOX_TABLE))

        self.reset_tables()
        woken.clear()

        failure_event = self.event("job_audit_failure")
        self.preseed_audit(failure_event)
        failure_adapter = self.adapter(woken.append)

        def failing_job() -> None:
            insert_business("job-failure")
            failure_adapter.emit_same_store(failure_event)

        with self.assertRaises(Exception):
            execute_job(
                site=SITE_NAME,
                method=failing_job,
                event="auditspec_runtime_lab",
                job_name="auditspec-runtime-failure",
                kwargs={},
                is_async=False,
            )

        self.assertEqual([], woken)
        self.assertEqual(0, table_count(BUSINESS_TABLE))
        self.assertEqual(1, table_count(AUDIT_TABLE))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the pinned Frappe Bench atomicity runtime lab")
    parser.add_argument("--bench", required=True, help="Path to the initialized Bench directory")
    parser.add_argument("--site", required=True, help="Frappe site name")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    BENCH_PATH = Path(args.bench).resolve()
    SITE_NAME = args.site
    unittest.main(argv=[sys.argv[0]], verbosity=2)
