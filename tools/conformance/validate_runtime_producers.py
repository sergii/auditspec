#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "schema" / "runtime-producer-manifest.schema.json"


def load(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    schema = load(SCHEMA_PATH)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    manifests = sorted((ROOT / "runtime" / "producers").glob("*.json"))
    if not manifests:
        print("No runtime producer manifests found.", file=sys.stderr)
        return 1

    failures = []
    for path in manifests:
        errors = sorted(validator.iter_errors(load(path)), key=lambda error: list(error.path))
        if errors:
            failures.append((path, errors))
            continue
        print(f"PASS runtime-producer {path.relative_to(ROOT)}")

    if failures:
        for path, errors in failures:
            print(f"FAIL runtime-producer {path.relative_to(ROOT)}", file=sys.stderr)
            for error in errors:
                location = "/".join(str(part) for part in error.path) or "<root>"
                print(f"  {location}: {error.message}", file=sys.stderr)
        return 1

    print(f"Validated {len(manifests)} runtime producer manifest(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
