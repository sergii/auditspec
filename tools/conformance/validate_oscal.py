#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from jsonschema import FormatChecker
from jsonschema.validators import validator_for


def load(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: validate_oscal.py <official-schema.json> <assessment-results.json>", file=sys.stderr)
        return 2

    schema_path = Path(sys.argv[1])
    document_path = Path(sys.argv[2])
    schema = load(schema_path)
    document = load(document_path)

    validator_class = validator_for(schema)
    validator_class.check_schema(schema)
    validator = validator_class(schema, format_checker=FormatChecker())
    errors = sorted(validator.iter_errors(document), key=lambda error: list(error.absolute_path))

    if errors:
        for error in errors:
            path = "/".join(str(part) for part in error.absolute_path) or "<root>"
            print(f"OSCAL INVALID {path}: {error.message}", file=sys.stderr)
        return 1

    print(f"OSCAL valid: {document_path} against {schema_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
