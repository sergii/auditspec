from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "implementations" / "python"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from auditspec import AuditSpecValidationError  # noqa: E402
from auditspec_frappe import FrappeAuditAdapter, operation_semantics  # noqa: E402


class CallbackRegistry:
    def __init__(self) -> None:
        self.callbacks: list[Callable[[], Any]] = []

    def add(self, callback: Callable[[], Any]) -> None:
        self.callbacks.append(callback)

    def run(self) -> None:
        callbacks = list(self.callbacks)
        self.callbacks.clear()
        for callback in callbacks:
            callback()

    def clear(self) -> None:
        self.callbacks.clear()


class FakeFrappeDB:
    def __init__(self) -> None:
        self.after_commit = CallbackRegistry()
        self.commit_calls = 0
        self.rollback_calls = 0

    def commit(self) -> None:
        self.commit_calls += 1
        self.after_commit.run()

    def rollback(self) -> None:
        self.rollback_calls += 1
        self.after_commit.clear()


class FrappeAdapterTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        with (ROOT / "conformance" / "valid" / "agent-action.json").open("r", encoding="utf-8") as handle:
            cls.base_event = json.load(handle)

    def event(self, **overrides: Any) -> dict[str, Any]:
        value = copy.deepcopy(self.base_event)
        value.update(overrides)
        return value

    def adapter(self, *, wake: Callable[[str], Any] | None = None):
        db = FakeFrappeDB()
        events: list[dict[str, Any]] = []
        outbox: dict[str, dict[str, Any]] = {}

        def insert_event(event: dict[str, Any]) -> dict[str, Any]:
            events.append(copy.deepcopy(event))
            return event

        def insert_outbox(identity: str, event: dict[str, Any]) -> str:
            if identity in outbox:
                raise ValueError("duplicate outbox identity")
            outbox[identity] = copy.deepcopy(event)
            return identity

        return db, events, outbox, FrappeAuditAdapter(
            db=db,
            insert_event=insert_event,
            insert_outbox=insert_outbox,
            wake_publisher=wake,
        )

    def test_same_store_emit_joins_current_transaction_without_committing(self) -> None:
        db, events, _, adapter = self.adapter()
        adapter.emit_same_store(self.event())

        self.assertEqual(1, len(events))
        self.assertEqual(0, db.commit_calls)
        self.assertEqual(0, db.rollback_calls)

    def test_invalid_event_is_rejected_before_storage(self) -> None:
        db, events, _, adapter = self.adapter()
        invalid = self.event()
        del invalid["actor"]

        with self.assertRaises(AuditSpecValidationError):
            adapter.emit_same_store(invalid)

        self.assertEqual([], events)
        self.assertEqual(0, db.commit_calls)

    def test_outbox_wakeup_runs_only_after_commit(self) -> None:
        woken: list[str] = []
        db, _, outbox, adapter = self.adapter(wake=woken.append)

        identity = adapter.stage_outbox(self.event())
        self.assertEqual(1, len(outbox))
        self.assertEqual([], woken)
        self.assertEqual(0, db.commit_calls)

        db.commit()
        self.assertEqual([identity], woken)
        self.assertIn(identity, outbox)

    def test_rollback_drops_after_commit_wakeup_but_not_by_adapter_side_effect(self) -> None:
        woken: list[str] = []
        db, _, _, adapter = self.adapter(wake=woken.append)
        adapter.stage_outbox(self.event())

        db.rollback()
        self.assertEqual([], woken)
        self.assertEqual(1, db.rollback_calls)

    def test_wakeup_failure_after_commit_does_not_erase_durable_outbox(self) -> None:
        def fail(_identity: str) -> None:
            raise RuntimeError("publisher unavailable")

        db, _, outbox, adapter = self.adapter(wake=fail)
        identity = adapter.stage_outbox(self.event())

        with self.assertRaises(RuntimeError):
            db.commit()

        self.assertIn(identity, outbox)
        self.assertEqual(1, db.commit_calls)

    def test_duplicate_outbox_identity_does_not_register_second_wakeup(self) -> None:
        woken: list[str] = []
        db, _, _, adapter = self.adapter(wake=woken.append)
        event = self.event()
        adapter.stage_outbox(event)

        with self.assertRaisesRegex(ValueError, "duplicate outbox identity"):
            adapter.stage_outbox(event)

        self.assertEqual(1, len(db.after_commit.callbacks))

    def test_frappe_operation_semantics_are_conservative(self) -> None:
        truncate = operation_semantics("frappe.db.truncate")
        self.assertEqual("non_rollbackable", truncate.transaction)
        self.assertEqual("bypassed", truncate.document_hooks)

        commit = operation_semantics("frappe.db.commit")
        self.assertEqual("boundary", commit.transaction)

        set_value = operation_semantics("frappe.db.set_value")
        self.assertEqual("current", set_value.transaction)
        self.assertEqual("bypassed", set_value.document_hooks)

        unknown = operation_semantics("frappe.some_future_api")
        self.assertEqual("current", unknown.transaction)
        self.assertEqual("unknown", unknown.document_hooks)


if __name__ == "__main__":
    unittest.main()
