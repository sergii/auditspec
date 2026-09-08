from __future__ import annotations

import json
import unittest
from pathlib import Path

import auditspec


class ConformanceTest(unittest.TestCase):
    NON_CORE = {
        "assessment-report": "assessment",
        "assessment-diff": "assessment_diff",
        "assurance-graph": "assurance_graph",
        "assurance-graph-diff": "assurance_graph_diff",
        "remediation-plan": "remediation_plan",
        "verification-result": "verification_result",
        "control-mapping-profile": "control_mapping_profile",
        "control-mapping-result": "control_mapping_result",
        "evidence-query-result": "evidence_query_result",
        "oscal-export-request": "oscal_export_request",
        "runtime-evidence-record": "runtime_evidence_record",
        "corroboration-report": "corroboration_report",
        "corroboration-diff": "corroboration_diff",
        "corroboration-query-result": "corroboration_query_result",
        "agent-profile": "agent_profile",
    }

    CANONICAL = {
        "schema/examples/user-action.json": "event",
        "schema/examples/agent-action.json": "event",
        "schema/examples/denied-action.json": "event",
        "schema/examples/assessment-report.json": "assessment",
        "schema/examples/assessment-diff.json": "assessment_diff",
        "schema/examples/assurance-graph.json": "assurance_graph",
        "schema/examples/assurance-graph-diff.json": "assurance_graph_diff",
        "schema/examples/remediation-plan.json": "remediation_plan",
        "schema/examples/verification-result.json": "verification_result",
        "schema/examples/control-mapping-result.json": "control_mapping_result",
        "schema/examples/evidence-query-result.json": "evidence_query_result",
        "schema/examples/oscal-export-request.json": "oscal_export_request",
        "schema/examples/runtime-evidence-record.json": "runtime_evidence_record",
        "schema/examples/corroboration-report.json": "corroboration_report",
        "schema/examples/corroboration-diff.json": "corroboration_diff",
        "schema/examples/corroboration-query-result.json": "corroboration_query_result",
        "profiles/agent/examples/tool-call.json": "agent_profile",
        "mappings/controls/nist-sp800-53-r5.2.0.json": "control_mapping_profile",
    }

    def load_json(self, relative_path: str):
        with (auditspec.ROOT / relative_path).open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def fixture_paths(self, relative_directory: str) -> list[Path]:
        return sorted((auditspec.ROOT / relative_directory).glob("*.json"))

    def test_shared_valid_event_corpus(self):
        for path in self.fixture_paths("conformance/valid"):
            with self.subTest(path=path.name):
                result = auditspec.validate(self.load_json(f"conformance/valid/{path.name}"))
                self.assertTrue(result["valid"], result["errors"])

    def test_shared_invalid_event_corpus(self):
        for path in self.fixture_paths("conformance/invalid"):
            with self.subTest(path=path.name):
                result = auditspec.validate(self.load_json(f"conformance/invalid/{path.name}"))
                self.assertFalse(result["valid"], f"{path.name} unexpectedly validated")

    def test_shared_non_core_negative_corpus(self):
        for directory, contract in self.NON_CORE.items():
            for path in self.fixture_paths(f"conformance/invalid/{directory}"):
                with self.subTest(contract=contract, path=path.name):
                    result = auditspec.validate(
                        self.load_json(f"conformance/invalid/{directory}/{path.name}"),
                        contract=contract,
                    )
                    self.assertFalse(result["valid"], f"{directory}/{path.name} unexpectedly validated")

    def test_canonical_examples(self):
        for path, contract in self.CANONICAL.items():
            with self.subTest(path=path, contract=contract):
                result = auditspec.validate(self.load_json(path), contract=contract)
                self.assertTrue(result["valid"], result["errors"])

    def test_validate_or_raise(self):
        valid = self.load_json("schema/examples/user-action.json")
        self.assertIs(valid, auditspec.validate_or_raise(valid))

        with self.assertRaises(auditspec.AuditSpecValidationError) as captured:
            auditspec.validate_or_raise(self.load_json("conformance/invalid/missing-actor.json"))
        self.assertTrue(captured.exception.issues)


if __name__ == "__main__":
    unittest.main()
