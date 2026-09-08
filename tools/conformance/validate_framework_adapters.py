#!/usr/bin/env python3

import json
import sys
from pathlib import Path

from jsonschema import Draft202012Validator


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "schema" / "framework-adapter-manifest.schema.json"


def load(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    schema = load(SCHEMA_PATH)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    manifests = sorted((ROOT / "frameworks").glob("*/adapter.json"))
    if not manifests:
        print("No framework adapter manifests found.", file=sys.stderr)
        return 1

    failures = []
    for path in manifests:
        errors = sorted(validator.iter_errors(load(path)), key=lambda error: list(error.path))
        if errors:
            failures.append((path, errors))
            continue
        print(f"PASS framework-adapter {path.relative_to(ROOT)}")

    if failures:
        for path, errors in failures:
            print(f"FAIL framework-adapter {path.relative_to(ROOT)}", file=sys.stderr)
            for error in errors:
                location = "/".join(str(part) for part in error.path) or "<root>"
                print(f"  {location}: {error.message}", file=sys.stderr)
        return 1

    print(f"Validated {len(manifests)} framework adapter manifest(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
