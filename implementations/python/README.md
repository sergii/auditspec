# Python reference implementation

The Python reference is an executable, framework-neutral implementation of AuditSpec v0.1.

It reuses the root JSON Schemas and shared conformance corpus rather than creating Python- or Frappe-specific event semantics.

## Current surface

```python
import auditspec

result = auditspec.validate(event)
auditspec.validate_or_raise(event)

normalized = auditspec.normalize(event)
redacted = auditspec.redact(event)

identity = auditspec.event_identity(event)
```

Additional primitives:

- `auditspec.Deduplicator` models `(source, id)` duplicate/conflict semantics and optional `idempotency_key` conflicts;
- `auditspec.Emitter` validates before forwarding an event to a caller-supplied sink;
- all machine-readable v0.1 contracts can be selected with `contract=`.

Example:

```python
auditspec.validate(report, contract="assessment")
auditspec.validate(graph, contract="assurance_graph")
auditspec.validate(profile, contract="agent_profile")
```

## Validation

The implementation uses `jsonschema` Draft 2020-12 with format checking enabled.

The repository-root JSON Schemas remain the source of truth.

## Redaction

`auditspec.redact`:

- redacts common secret-bearing keys by default;
- supports explicit JSON Pointer paths;
- records `redactions[]` provenance;
- does not mutate caller input;
- is idempotent across retries.

## Delivery identity

Logical event identity is `(source, id)`, matching `spec/delivery.md`.

Identical retries can be classified as duplicates. Reusing the same identity for a different payload raises `AuditIdentityConflictError`.

## Frappe integration

The Python reference deliberately does not depend on Frappe.

A Frappe adapter should use these primitives from the service/document boundary while preserving Frappe's native Version and Access Log mechanisms for their existing low-level purposes.

When a semantic business mutation and durable AuditSpec intent can share a database transaction, they should do so. External sinks should use durable outbox intent rather than fire-and-forget HTTP.

See:

- `frameworks/frappe/README.md`
- `profiles/atomicity/README.md`
- `lab/postgres-atomicity/`

## Tests

```bash
cd implementations/python
python -m pip install -r requirements.txt
python -m unittest discover -s test -p '*_test.py'
```

The test suite consumes the same valid/invalid Core and non-Core fixtures as Python conformance, TypeScript, and Ruby.

CI runs the reference on Python 3.11.16 and Python 3.14.7.
