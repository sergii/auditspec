from __future__ import annotations

import copy
import json
import unittest

import auditspec


class ReferenceTest(unittest.TestCase):
    def event(self):
        with (auditspec.ROOT / "conformance/valid/agent-action.json").open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def test_normalization_is_deterministic_and_idempotent(self):
        value = self.event()
        value["metadata"] = {"z": 1, "a": {"y": 2, "b": 3}}

        normalized = auditspec.normalize(value)
        self.assertEqual(["a", "z"], list(normalized["metadata"]))
        self.assertEqual(["b", "y"], list(normalized["metadata"]["a"]))
        self.assertEqual(normalized, auditspec.normalize(normalized))
        self.assertEqual(["z", "a"], list(value["metadata"]))

    def test_redaction_is_secret_safe_and_idempotent(self):
        value = self.event()
        value["metadata"] = {
            "token": "metadata-secret",
            "nested": {"password": "nested-secret", "safe": "visible"},
        }

        once = auditspec.redact(value)
        twice = auditspec.redact(once)

        self.assertEqual("[REDACTED]", once["metadata"]["token"])
        self.assertEqual("[REDACTED]", once["metadata"]["nested"]["password"])
        self.assertEqual("visible", once["metadata"]["nested"]["safe"])
        self.assertEqual(once, twice)
        self.assertTrue(auditspec.validate(once)["valid"])
        self.assertEqual("metadata-secret", value["metadata"]["token"])

    def test_explicit_json_pointer_path_uses_rfc6901_escaping(self):
        value = self.event()
        value["metadata"] = {"credential/with~separator": "secret"}
        path = "/metadata/credential~1with~0separator"

        redacted = auditspec.redact(value, keys=[], paths=[path])

        self.assertEqual("[REDACTED]", redacted["metadata"]["credential/with~separator"])
        self.assertEqual(path, redacted["redactions"][0]["path"])

    def test_delivery_deduplicates_identical_retry(self):
        store = auditspec.Deduplicator()
        value = self.event()
        value["idempotency_key"] = "invoice:INV-0042:approve"

        self.assertEqual("accepted", store.accept(value)["status"])
        self.assertEqual("duplicate", store.accept(copy.deepcopy(value))["status"])
        self.assertEqual(1, store.size)
        self.assertEqual(f"{value['source']}\0{value['id']}", auditspec.event_identity(value))

    def test_delivery_rejects_same_identity_with_different_payload(self):
        store = auditspec.Deduplicator()
        value = self.event()
        store.accept(value)
        conflicting = copy.deepcopy(value)
        conflicting["result"] = {"status": "failed", "code": "db_error"}

        with self.assertRaises(auditspec.AuditIdentityConflictError):
            store.accept(conflicting)
        self.assertEqual(1, store.size)

    def test_idempotency_key_cannot_silently_map_to_two_event_ids(self):
        store = auditspec.Deduplicator()
        first = self.event()
        first.update({"id": "aud_python_1", "idempotency_key": "same-operation"})
        second = copy.deepcopy(first)
        second["id"] = "aud_python_2"

        store.accept(first)
        with self.assertRaises(auditspec.AuditIdentityConflictError):
            store.accept(second)
        self.assertEqual(1, store.size)

    def test_same_id_under_different_source_is_a_distinct_identity(self):
        store = auditspec.Deduplicator()
        first = self.event()
        second = copy.deepcopy(first)
        first["source"] = "urn:example:python-a"
        second["source"] = "urn:example:python-b"

        self.assertEqual("accepted", store.accept(first)["status"])
        self.assertEqual("accepted", store.accept(second)["status"])
        self.assertEqual(2, store.size)

    def test_emitter_validates_before_calling_sink(self):
        emitted = []
        emitter = auditspec.Emitter(lambda value: emitted.append(value) or "stored")
        value = self.event()

        self.assertEqual("stored", emitter.emit(value))
        self.assertEqual([value], emitted)

        invalid = copy.deepcopy(value)
        del invalid["actor"]
        with self.assertRaises(auditspec.AuditSpecValidationError):
            emitter.emit(invalid)
        self.assertEqual([value], emitted)


if __name__ == "__main__":
    unittest.main()
