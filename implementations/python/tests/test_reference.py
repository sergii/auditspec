from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from auditspec_ref import (
    AuditDeduplicator,
    AuditIdentityConflictError,
    assert_valid,
    emit,
    normalize_event,
    redact_event,
    validate,
)

ROOT = Path(__file__).resolve().parents[3]


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def json_files(path: str):
    return sorted((ROOT / path).glob("*.json"))


def test_shared_valid_event_vectors():
    paths = json_files("conformance/valid") + [
        ROOT / "schema/examples/user-action.json",
        ROOT / "schema/examples/agent-action.json",
        ROOT / "schema/examples/denied-action.json",
    ]
    for path in paths:
        errors = validate("event", json.loads(path.read_text(encoding="utf-8")))
        assert errors == [], f"{path.relative_to(ROOT)}: {errors}"


def test_shared_invalid_event_vectors():
    for path in json_files("conformance/invalid"):
        errors = validate("event", json.loads(path.read_text(encoding="utf-8")))
        assert errors, f"{path.relative_to(ROOT)} unexpectedly validated"


@pytest.mark.parametrize(
    ("contract", "example", "invalid_dir"),
    [
        ("assessment", "schema/examples/assessment-report.json", "assessment-report"),
        ("assessment-diff", "schema/examples/assessment-diff.json", "assessment-diff"),
        ("assurance-graph", "schema/examples/assurance-graph.json", "assurance-graph"),
        ("assurance-graph-diff", "schema/examples/assurance-graph-diff.json", "assurance-graph-diff"),
        ("remediation-plan", "schema/examples/remediation-plan.json", "remediation-plan"),
        ("verification-result", "schema/examples/verification-result.json", "verification-result"),
        (
            "control-mapping-profile",
            "mappings/controls/nist-sp800-53-r5.2.0.json",
            "control-mapping-profile",
        ),
        ("control-mapping-result", "schema/examples/control-mapping-result.json", "control-mapping-result"),
        ("evidence-query-result", "schema/examples/evidence-query-result.json", "evidence-query-result"),
        ("oscal-export-request", "schema/examples/oscal-export-request.json", "oscal-export-request"),
        ("agent-profile", "profiles/agent/examples/tool-call.json", "agent-profile"),
    ],
)
def test_non_core_shared_conformance(contract: str, example: str, invalid_dir: str):
    assert validate(contract, load(example)) == []
    paths = json_files(f"conformance/invalid/{invalid_dir}")
    assert paths, f"missing invalid suite for {contract}"
    for path in paths:
        errors = validate(contract, json.loads(path.read_text(encoding="utf-8")))
        assert errors, f"{path.relative_to(ROOT)} unexpectedly validated"


def test_normalization_is_idempotent_and_order_independent():
    event = load("schema/examples/user-action.json")
    event["metadata"] = {"z": 1, "a": {"y": 2, "b": 3}}
    normalized = normalize_event(event)
    assert normalize_event(normalized) == normalized
    assert list(normalized["metadata"].keys()) == ["a", "z"]
    assert list(normalized["metadata"]["a"].keys()) == ["b", "y"]


def test_redaction_is_retry_idempotent():
    event = load("schema/examples/user-action.json")
    event["metadata"] = {"token": "raw", "nested": {"password": "secret", "safe": "visible"}}

    once = redact_event(event)
    twice = redact_event(once)

    assert twice == once
    assert once["metadata"]["token"] == "[REDACTED]"
    assert once["metadata"]["nested"]["password"] == "[REDACTED]"
    assert once["metadata"]["nested"]["safe"] == "visible"
    assert len(once["redactions"]) == 2
    assert event["metadata"]["token"] == "raw"


def test_delivery_identity_and_idempotency_rules():
    base = load("schema/examples/agent-action.json")
    base["idempotency_key"] = "approve:INV-0042"
    store = AuditDeduplicator()

    assert store.accept(base) == "accepted"
    assert store.accept(copy.deepcopy(base)) == "duplicate"
    assert store.size == 1

    conflict = copy.deepcopy(base)
    conflict["result"] = {"status": "failed", "code": "db_error"}
    with pytest.raises(AuditIdentityConflictError):
        store.accept(conflict)

    second_identity = copy.deepcopy(base)
    second_identity["id"] = "aud_agent_002"
    with pytest.raises(AuditIdentityConflictError):
        store.accept(second_identity)


def test_emitter_validates_before_persisting_and_passes_a_copy():
    event = load("schema/examples/user-action.json")
    persisted = []

    result = emit(event, lambda value: persisted.append(value) or "ok")
    assert result == "ok"
    assert persisted == [event]
    assert persisted[0] is not event

    invalid = copy.deepcopy(event)
    del invalid["actor"]
    with pytest.raises(ValueError):
        emit(invalid, persisted.append)
    assert len(persisted) == 1


def test_assert_valid_reports_invalid_contract():
    invalid = load("schema/examples/user-action.json")
    del invalid["actor"]
    with pytest.raises(ValueError, match="Invalid AuditSpec event"):
        assert_valid("event", invalid)
