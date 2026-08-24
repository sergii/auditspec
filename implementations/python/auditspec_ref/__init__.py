from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any, Callable

from jsonschema import Draft202012Validator, FormatChecker

JsonObject = dict[str, Any]
PersistCallback = Callable[[JsonObject], Any]

_ROOT = Path(__file__).resolve().parents[3]
_SCHEMA_PATHS = {
    "event": _ROOT / "schema" / "audit-event.schema.json",
    "assessment": _ROOT / "schema" / "assessment-report.schema.json",
    "assessment-diff": _ROOT / "schema" / "assessment-diff.schema.json",
    "assurance-graph": _ROOT / "schema" / "assurance-graph.schema.json",
    "assurance-graph-diff": _ROOT / "schema" / "assurance-graph-diff.schema.json",
    "remediation-plan": _ROOT / "schema" / "remediation-plan.schema.json",
    "verification-result": _ROOT / "schema" / "verification-result.schema.json",
    "control-mapping-profile": _ROOT / "schema" / "control-mapping-profile.schema.json",
    "control-mapping-result": _ROOT / "schema" / "control-mapping-result.schema.json",
    "evidence-query-result": _ROOT / "schema" / "evidence-query-result.schema.json",
    "oscal-export-request": _ROOT / "schema" / "oscal-export-request.schema.json",
    "agent-profile": _ROOT / "profiles" / "agent" / "agent-profile.schema.json",
}

DEFAULT_SECRET_KEYS = {
    "password",
    "secret",
    "token",
    "api_key",
    "access_token",
    "refresh_token",
    "session_cookie",
    "private_key",
}


class AuditIdentityConflictError(ValueError):
    pass


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _validator(contract: str) -> Draft202012Validator:
    try:
        schema_path = _SCHEMA_PATHS[contract]
    except KeyError as exc:
        raise KeyError(f"Unknown AuditSpec contract: {contract}") from exc

    schema = _load_json(schema_path)
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def validate(contract: str, value: Any) -> list[str]:
    validator = _validator(contract)
    errors = sorted(validator.iter_errors(value), key=lambda error: list(error.path))
    return [error.message for error in errors]


def assert_valid(contract: str, value: Any) -> None:
    errors = validate(contract, value)
    if errors:
        raise ValueError(f"Invalid AuditSpec {contract}: {'; '.join(errors)}")


def _normalize(value: Any) -> Any:
    if isinstance(value, list):
        return [_normalize(item) for item in value]
    if isinstance(value, dict):
        return {key: _normalize(value[key]) for key in sorted(value)}
    return value


def normalize_event(event: JsonObject) -> JsonObject:
    return _normalize(event)


def _pointer_segment(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def redact_event(
    event: JsonObject,
    *,
    keys: set[str] | None = None,
    paths: set[str] | None = None,
    method: str = "redacted",
    reason: str = "sensitive_data",
    replacement: str = "[REDACTED]",
) -> JsonObject:
    clone = copy.deepcopy(event)
    secret_keys = {key.lower() for key in (keys or DEFAULT_SECRET_KEYS)}
    explicit_paths = paths or set()
    existing = clone.pop("redactions", [])
    additions: list[JsonObject] = []

    def visit(value: Any, path: str) -> None:
        if isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{path}/{index}")
            return
        if not isinstance(value, dict):
            return

        for key in list(value.keys()):
            child_path = f"{path}/{_pointer_segment(key)}"
            child = value[key]
            if key.lower() in secret_keys or child_path in explicit_paths:
                if method == "omitted":
                    del value[key]
                else:
                    value[key] = replacement
                additions.append({"path": child_path, "method": method, "reason": reason})
                continue
            visit(child, child_path)

    visit(clone, "")

    seen: set[tuple[str, str, str]] = set()
    merged: list[JsonObject] = []
    for item in [*existing, *additions]:
        identity = (item["path"], item["method"], item["reason"])
        if identity in seen:
            continue
        seen.add(identity)
        merged.append(item)

    if merged:
        clone["redactions"] = merged
    return clone


def event_identity(event: JsonObject) -> str:
    return f"{event['source']}\0{event['id']}"


def _canonical_payload(event: JsonObject) -> str:
    return json.dumps(normalize_event(event), separators=(",", ":"), ensure_ascii=False)


class AuditDeduplicator:
    def __init__(self) -> None:
        self._events: dict[str, str] = {}
        self._idempotency: dict[str, str] = {}

    @property
    def size(self) -> int:
        return len(self._events)

    def accept(self, event: JsonObject) -> str:
        assert_valid("event", event)
        identity = event_identity(event)
        payload = _canonical_payload(event)

        existing = self._events.get(identity)
        if existing is not None:
            if existing != payload:
                raise AuditIdentityConflictError(
                    f"AuditSpec identity collision: {event['source']} + {event['id']} refers to different payloads"
                )
            return "duplicate"

        key = event.get("idempotency_key")
        if key is not None:
            idempotency_identity = f"{event['source']}\0{key}"
            previous = self._idempotency.get(idempotency_identity)
            if previous is not None and previous != identity:
                raise AuditIdentityConflictError(
                    f"AuditSpec idempotency_key collision: {key} was previously associated with another event identity"
                )
            self._idempotency[idempotency_identity] = identity

        self._events[identity] = payload
        return "accepted"


def emit(event: JsonObject, persist: PersistCallback) -> Any:
    assert_valid("event", event)
    return persist(copy.deepcopy(event))
