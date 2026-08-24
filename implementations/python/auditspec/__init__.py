from __future__ import annotations

import copy
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[3]

SCHEMAS = {
    "event": "schema/audit-event.schema.json",
    "assessment": "schema/assessment-report.schema.json",
    "assessment_diff": "schema/assessment-diff.schema.json",
    "assurance_graph": "schema/assurance-graph.schema.json",
    "assurance_graph_diff": "schema/assurance-graph-diff.schema.json",
    "remediation_plan": "schema/remediation-plan.schema.json",
    "verification_result": "schema/verification-result.schema.json",
    "control_mapping_profile": "schema/control-mapping-profile.schema.json",
    "control_mapping_result": "schema/control-mapping-result.schema.json",
    "evidence_query_result": "schema/evidence-query-result.schema.json",
    "oscal_export_request": "schema/oscal-export-request.schema.json",
    "runtime_evidence_record": "schema/runtime-evidence-record.schema.json",
    "corroboration_report": "schema/corroboration-report.schema.json",
    "corroboration_diff": "schema/corroboration-diff.schema.json",
    "agent_profile": "profiles/agent/agent-profile.schema.json",
}

DEFAULT_SECRET_KEYS = (
    "password",
    "secret",
    "token",
    "api_key",
    "access_token",
    "refresh_token",
    "session_cookie",
    "private_key",
)


class AuditSpecValidationError(ValueError):
    def __init__(self, contract: str, issues: list[dict[str, Any]]) -> None:
        super().__init__(f"Invalid AuditSpec {contract}")
        self.contract = contract
        self.issues = issues


class AuditIdentityConflictError(ValueError):
    pass


@lru_cache(maxsize=None)
def _validator(contract: str) -> Draft202012Validator:
    try:
        relative_path = SCHEMAS[contract]
    except KeyError as exc:
        raise ValueError(f"Unknown AuditSpec contract: {contract}") from exc

    with (ROOT / relative_path).open("r", encoding="utf-8") as handle:
        schema = json.load(handle)

    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema, format_checker=FormatChecker())


def validate(value: Any, *, contract: str = "event") -> dict[str, Any]:
    errors = sorted(_validator(contract).iter_errors(value), key=lambda error: list(error.path))
    issues = [
        {
            "instance_path": "/" + "/".join(str(part) for part in error.path) if error.path else "",
            "schema_path": "/" + "/".join(str(part) for part in error.schema_path),
            "validator": error.validator,
            "message": error.message,
        }
        for error in errors
    ]
    return {"valid": not issues, "errors": issues}


def validate_or_raise(value: Any, *, contract: str = "event") -> Any:
    result = validate(value, contract=contract)
    if not result["valid"]:
        raise AuditSpecValidationError(contract, result["errors"])
    return value


def normalize(value: Any) -> Any:
    if isinstance(value, list):
        return [normalize(child) for child in value]
    if isinstance(value, dict):
        return {str(key): normalize(value[key]) for key in sorted(value, key=lambda item: str(item))}
    return value


def _pointer_segment(value: str) -> str:
    return value.replace("~", "~0").replace("/", "~1")


def _unique_redactions(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, Any, Any]] = set()
    result: list[dict[str, Any]] = []
    for redaction in values:
        identity = (redaction.get("path"), redaction.get("method"), redaction.get("reason"))
        if identity in seen:
            continue
        seen.add(identity)
        result.append(redaction)
    return result


def redact(
    event: dict[str, Any],
    *,
    keys: tuple[str, ...] | list[str] = DEFAULT_SECRET_KEYS,
    paths: tuple[str, ...] | list[str] = (),
    method: str = "redacted",
    reason: str = "sensitive_data",
    replacement: str = "[REDACTED]",
) -> dict[str, Any]:
    clone = copy.deepcopy(event)
    normalized_keys = {key.lower() for key in keys}
    explicit_paths = set(paths)
    existing = clone.pop("redactions", [])
    additions: list[dict[str, Any]] = []

    def visit(value: Any, path: str) -> None:
        if isinstance(value, list):
            for index, child in enumerate(value):
                visit(child, f"{path}/{index}")
            return

        if not isinstance(value, dict):
            return

        for key in list(value):
            child_path = f"{path}/{_pointer_segment(str(key))}"
            matches = str(key).lower() in normalized_keys or child_path in explicit_paths
            if matches:
                if method == "omitted":
                    del value[key]
                else:
                    value[key] = replacement
                additions.append({"path": child_path, "method": method, "reason": reason})
            else:
                visit(value[key], child_path)

    visit(clone, "")
    redactions = _unique_redactions([*existing, *additions])
    if redactions:
        clone["redactions"] = redactions
    return clone


def event_identity(event: dict[str, Any]) -> str:
    validate_or_raise(event)
    return f"{event['source']}\0{event['id']}"


def _canonical_payload(event: dict[str, Any]) -> str:
    return json.dumps(normalize(event), ensure_ascii=False, separators=(",", ":"))


class Deduplicator:
    def __init__(self) -> None:
        self._events: dict[str, str] = {}
        self._idempotency_keys: dict[str, str] = {}

    def accept(self, event: dict[str, Any]) -> dict[str, str]:
        validate_or_raise(event)
        identity = event_identity(event)
        payload = _canonical_payload(event)

        if identity in self._events:
            if self._events[identity] != payload:
                raise AuditIdentityConflictError("AuditSpec identity collision for source + id")
            return {"status": "duplicate", "identity": identity}

        idempotency_key = event.get("idempotency_key")
        if idempotency_key is not None:
            idempotency_identity = f"{event['source']}\0{idempotency_key}"
            previous_identity = self._idempotency_keys.get(idempotency_identity)
            if previous_identity is not None and previous_identity != identity:
                raise AuditIdentityConflictError("AuditSpec idempotency_key collision")
            self._idempotency_keys[idempotency_identity] = identity

        self._events[identity] = payload
        return {"status": "accepted", "identity": identity}

    @property
    def size(self) -> int:
        return len(self._events)


class Emitter:
    def __init__(self, sink: Callable[[dict[str, Any]], Any]) -> None:
        self._sink = sink

    def emit(self, event: dict[str, Any]) -> Any:
        validate_or_raise(event)
        return self._sink(event)


__all__ = [
    "AuditIdentityConflictError",
    "AuditSpecValidationError",
    "DEFAULT_SECRET_KEYS",
    "Deduplicator",
    "Emitter",
    "ROOT",
    "event_identity",
    "normalize",
    "redact",
    "validate",
    "validate_or_raise",
]
