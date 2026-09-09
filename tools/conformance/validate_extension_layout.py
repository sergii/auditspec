#!/usr/bin/env python3

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[2]
ADAPTERS = ROOT / "adapters"
LEGACY_FRAMEWORKS = ROOT / "frameworks"


def main() -> int:
    failures: list[str] = []

    if LEGACY_FRAMEWORKS.exists():
        failures.append(
            "top-level frameworks/ is reserved from v0.2 onward; runtime framework integrations belong under adapters/"
        )

    if not ADAPTERS.is_dir():
        failures.append("adapters/ directory is missing")
    else:
        adapter_dirs = sorted(path for path in ADAPTERS.iterdir() if path.is_dir())
        if not adapter_dirs:
            failures.append("adapters/ contains no framework extension directories")
        for directory in adapter_dirs:
            manifest = directory / "adapter.json"
            if not manifest.is_file():
                failures.append(f"adapter directory has no adapter.json: {directory.relative_to(ROOT)}")

    if failures:
        for failure in failures:
            print(f"FAIL extension-layout {failure}", file=sys.stderr)
        return 1

    print("PASS extension-layout runtime framework integrations live under adapters/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
