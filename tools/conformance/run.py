#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[2]
EVENT_SCHEMA_PATH = ROOT / "schema" / "audit-event.schema.json"
ASSESSMENT_SCHEMA_PATH = ROOT / "schema" / "assessment-report.schema.json"
ASSESSMENT_DIFF_SCHEMA_PATH = ROOT / "schema" / "assessment-diff.schema.json"
ASSURANCE_GRAPH_SCHEMA_PATH = ROOT / "schema" / "assurance-graph.schema.json"
ASSURANCE_GRAPH_DIFF_SCHEMA_PATH = ROOT / "schema" / "assurance-graph-diff.schema.json"
REMEDIATION_PLAN_SCHEMA_PATH = ROOT / "schema" / "remediation-plan.schema.json"
VERIFICATION_RESULT_SCHEMA_PATH = ROOT / "schema" / "verification-result.schema.json"
CONTROL_MAPPING_PROFILE_SCHEMA_PATH = ROOT / "schema" / "control-mapping-profile.schema.json"
CONTROL_MAPPING_RESULT_SCHEMA_PATH = ROOT / "schema" / "control-mapping-result.schema.json"
EVIDENCE_QUERY_RESULT_SCHEMA_PATH = ROOT / "schema" / "evidence-query-result.schema.json"
OSCAL_EXPORT_REQUEST_SCHEMA_PATH = ROOT / "schema" / "oscal-export-request.schema.json"
AGENT_PROFILE_SCHEMA_PATH = ROOT / "profiles" / "agent" / "agent-profile.schema.json"
VALID_DIR = ROOT / "conformance" / "valid"
INVALID_DIR = ROOT / "conformance" / "invalid"
EVENT_EXAMPLES = [
    ROOT / "schema" / "examples" / "user-action.json",
    ROOT / "schema" / "examples" / "agent-action.json",
    ROOT / "schema" / "examples" / "denied-action.json",
]
ASSESSMENT_EXAMPLES = [ROOT / "schema" / "examples" / "assessment-report.json"]
ASSESSMENT_DIFF_EXAMPLES = [ROOT / "schema" / "examples" / "assessment-diff.json"]
ASSURANCE_GRAPH_EXAMPLES = [ROOT / "schema" / "examples" / "assurance-graph.json"]
ASSURANCE_GRAPH_DIFF_EXAMPLES = [ROOT / "schema" / "examples" / "assurance-graph-diff.json"]
REMEDIATION_PLAN_EXAMPLES = [ROOT / "schema" / "examples" / "remediation-plan.json"]
VERIFICATION_RESULT_EXAMPLES = [ROOT / "schema" / "examples" / "verification-result.json"]
CONTROL_MAPPING_PROFILE_EXAMPLES = [ROOT / "mappings" / "controls" / "nist-sp800-53-r5.2.0.json"]
CONTROL_MAPPING_RESULT_EXAMPLES = [ROOT / "schema" / "examples" / "control-mapping-result.json"]
EVIDENCE_QUERY_RESULT_EXAMPLES = [ROOT / "schema" / "examples" / "evidence-query-result.json"]
OSCAL_EXPORT_REQUEST_EXAMPLES = [ROOT / "schema" / "examples" / "oscal-export-request.json"]
AGENT_PROFILE_EXAMPLES = [ROOT / "profiles" / "agent" / "examples" / "tool-call.json"]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def make_validator(schema_path: Path):
    schema = load_json(schema_path)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def errors_for(validator, path: Path):
    value = load_json(path)
    return sorted(validator.iter_errors(value), key=lambda error: list(error.path))


def relative(path: Path):
    return path.relative_to(ROOT)


def expect_valid(validator, paths, label, failures):
    for path in paths:
        errors = errors_for(validator, path)
        if errors:
            failures.append(
                f"EXPECTED VALID {label}: {relative(path)}\n  "
                + "\n  ".join(error.message for error in errors)
            )
        else:
            print(f"PASS valid   {label:<14} {relative(path)}")


def main() -> int:
    event_validator = make_validator(EVENT_SCHEMA_PATH)
    assessment_validator = make_validator(ASSESSMENT_SCHEMA_PATH)
    assessment_diff_validator = make_validator(ASSESSMENT_DIFF_SCHEMA_PATH)
    assurance_graph_validator = make_validator(ASSURANCE_GRAPH_SCHEMA_PATH)
    assurance_graph_diff_validator = make_validator(ASSURANCE_GRAPH_DIFF_SCHEMA_PATH)
    remediation_plan_validator = make_validator(REMEDIATION_PLAN_SCHEMA_PATH)
    verification_result_validator = make_validator(VERIFICATION_RESULT_SCHEMA_PATH)
    control_mapping_profile_validator = make_validator(CONTROL_MAPPING_PROFILE_SCHEMA_PATH)
    control_mapping_result_validator = make_validator(CONTROL_MAPPING_RESULT_SCHEMA_PATH)
    evidence_query_result_validator = make_validator(EVIDENCE_QUERY_RESULT_SCHEMA_PATH)
    oscal_export_request_validator = make_validator(OSCAL_EXPORT_REQUEST_SCHEMA_PATH)
    agent_validator = make_validator(AGENT_PROFILE_SCHEMA_PATH)

    failures = []
    valid_event_paths = sorted(VALID_DIR.glob("*.json")) + EVENT_EXAMPLES
    invalid_event_paths = sorted(INVALID_DIR.glob("*.json"))

    expect_valid(event_validator, valid_event_paths, "event", failures)
    expect_valid(assessment_validator, ASSESSMENT_EXAMPLES, "assessment", failures)
    expect_valid(assessment_diff_validator, ASSESSMENT_DIFF_EXAMPLES, "diff", failures)
    expect_valid(assurance_graph_validator, ASSURANCE_GRAPH_EXAMPLES, "assurance-graph", failures)
    expect_valid(assurance_graph_diff_validator, ASSURANCE_GRAPH_DIFF_EXAMPLES, "graph-diff", failures)
    expect_valid(remediation_plan_validator, REMEDIATION_PLAN_EXAMPLES, "remediation", failures)
    expect_valid(verification_result_validator, VERIFICATION_RESULT_EXAMPLES, "verification", failures)
    expect_valid(control_mapping_profile_validator, CONTROL_MAPPING_PROFILE_EXAMPLES, "control-profile", failures)
    expect_valid(control_mapping_result_validator, CONTROL_MAPPING_RESULT_EXAMPLES, "control-result", failures)
    expect_valid(evidence_query_result_validator, EVIDENCE_QUERY_RESULT_EXAMPLES, "evidence", failures)
    expect_valid(oscal_export_request_validator, OSCAL_EXPORT_REQUEST_EXAMPLES, "oscal-request", failures)
    expect_valid(agent_validator, AGENT_PROFILE_EXAMPLES, "agent", failures)

    for path in invalid_event_paths:
        errors = errors_for(event_validator, path)
        if not errors:
            failures.append(f"EXPECTED INVALID event: {relative(path)}")
        else:
            print(f"PASS invalid event          {relative(path)}")

    print()
    print(
        "AuditSpec conformance: "
        f"{len(valid_event_paths)} valid event vectors, "
        f"{len(invalid_event_paths)} invalid event vectors, "
        f"{len(ASSESSMENT_EXAMPLES)} assessment example(s), "
        f"{len(ASSESSMENT_DIFF_EXAMPLES)} diff example(s), "
        f"{len(ASSURANCE_GRAPH_EXAMPLES)} assurance graph example(s), "
        f"{len(ASSURANCE_GRAPH_DIFF_EXAMPLES)} graph diff example(s), "
        f"{len(REMEDIATION_PLAN_EXAMPLES)} remediation example(s), "
        f"{len(VERIFICATION_RESULT_EXAMPLES)} verification example(s), "
        f"{len(CONTROL_MAPPING_PROFILE_EXAMPLES)} control profile example(s), "
        f"{len(CONTROL_MAPPING_RESULT_EXAMPLES)} control result example(s), "
        f"{len(EVIDENCE_QUERY_RESULT_EXAMPLES)} evidence example(s), "
        f"{len(OSCAL_EXPORT_REQUEST_EXAMPLES)} OSCAL request example(s), "
        f"{len(AGENT_PROFILE_EXAMPLES)} agent profile example(s)"
    )

    if failures:
        print()
        for failure in failures:
            print(f"FAIL {failure}")
        return 1

    print("All schema conformance vectors passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
