#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[2]
EVENT_SCHEMA_PATH = ROOT / "schema" / "audit-event.schema.json"
ASSESSMENT_SCHEMA_PATH = ROOT / "schema" / "assessment-report.schema.json"
AGENT_PROFILE_SCHEMA_PATH = ROOT / "profiles" / "agent" / "agent-profile.schema.json"
VALID_DIR = ROOT / "conformance" / "valid"
INVALID_DIR = ROOT / "conformance" / "invalid"
EVENT_EXAMPLES = [
    ROOT / "schema" / "examples" / "user-action.json",
    ROOT / "schema" / "examples" / "agent-action.json",
    ROOT / "schema" / "examples" / "denied-action.json",
]
ASSESSMENT_EXAMPLES = [ROOT / "schema" / "examples" / "assessment-report.json"]
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
            print(f"PASS valid   {label:<10} {relative(path)}")


def main() -> int:
    event_validator = make_validator(EVENT_SCHEMA_PATH)
    assessment_validator = make_validator(ASSESSMENT_SCHEMA_PATH)
    agent_validator = make_validator(AGENT_PROFILE_SCHEMA_PATH)

    failures = []
    valid_event_paths = sorted(VALID_DIR.glob("*.json")) + EVENT_EXAMPLES
    invalid_event_paths = sorted(INVALID_DIR.glob("*.json"))

    expect_valid(event_validator, valid_event_paths, "event", failures)
    expect_valid(assessment_validator, ASSESSMENT_EXAMPLES, "assessment", failures)
    expect_valid(agent_validator, AGENT_PROFILE_EXAMPLES, "agent", failures)

    for path in invalid_event_paths:
        errors = errors_for(event_validator, path)
        if not errors:
            failures.append(f"EXPECTED INVALID event: {relative(path)}")
        else:
            print(f"PASS invalid event      {relative(path)}")

    print()
    print(
        "AuditSpec conformance: "
        f"{len(valid_event_paths)} valid event vectors, "
        f"{len(invalid_event_paths)} invalid event vectors, "
        f"{len(ASSESSMENT_EXAMPLES)} assessment example(s), "
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
