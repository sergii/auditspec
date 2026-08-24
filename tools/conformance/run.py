#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "schema" / "audit-event.schema.json"
VALID_DIR = ROOT / "conformance" / "valid"
INVALID_DIR = ROOT / "conformance" / "invalid"
EXAMPLES_DIR = ROOT / "schema" / "examples"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def errors_for(validator, path: Path):
    value = load_json(path)
    return sorted(validator.iter_errors(value), key=lambda error: list(error.path))


def relative(path: Path):
    return path.relative_to(ROOT)


def main() -> int:
    schema = load_json(SCHEMA_PATH)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())

    failures = []
    valid_paths = sorted(VALID_DIR.glob("*.json")) + sorted(EXAMPLES_DIR.glob("*.json"))
    invalid_paths = sorted(INVALID_DIR.glob("*.json"))

    for path in valid_paths:
        errors = errors_for(validator, path)
        if errors:
            failures.append(
                f"EXPECTED VALID: {relative(path)}\n  "
                + "\n  ".join(error.message for error in errors)
            )
        else:
            print(f"PASS valid   {relative(path)}")

    for path in invalid_paths:
        errors = errors_for(validator, path)
        if not errors:
            failures.append(f"EXPECTED INVALID: {relative(path)}")
        else:
            print(f"PASS invalid {relative(path)}")

    print()
    print(
        f"AuditSpec conformance: {len(valid_paths)} valid vectors, "
        f"{len(invalid_paths)} invalid vectors"
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
