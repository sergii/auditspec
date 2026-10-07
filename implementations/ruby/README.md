# Ruby reference implementation

The Ruby reference is an executable, storage-neutral implementation of AuditSpec v0.1.

It intentionally reuses the root JSON Schemas and shared conformance corpus rather than defining Ruby-specific event semantics.

## Current surface

```ruby
require "auditspec"

result = AuditSpec.validate(event)
AuditSpec.validate!(event)

normalized = AuditSpec.normalize(event)
redacted = AuditSpec.redact(event)

identity = AuditSpec.event_identity(event)
```

Additional primitives:

- `AuditSpec::Deduplicator` models `(source, id)` duplicate/conflict semantics and optional `idempotency_key` conflicts;
- `AuditSpec::Emitter` validates before forwarding an event to a caller-supplied sink;
- validators are available for Core Event and all machine-readable v0.1 contracts through `contract:`.

Example:

```ruby
AuditSpec.validate(report, contract: :assessment)
AuditSpec.validate(graph, contract: :assurance_graph)
AuditSpec.validate(profile, contract: :agent_profile)
```

## Validation

The implementation uses `json_schemer` with JSON Schema Draft 2020-12 format validation enabled.

The schema files in the repository root remain the source of truth.

## Redaction

`AuditSpec.redact`:

- redacts common secret-bearing keys by default;
- supports explicit JSON Pointer paths;
- records `redactions[]` provenance;
- does not mutate the caller's input;
- is idempotent across retries.

## Delivery identity

Logical event identity is `(source, id)`, matching `spec/delivery.md`.

An identical retry can be classified as a duplicate. Reusing the same identity for a different semantic payload raises `AuditSpec::IdentityConflictError`.

## Transaction integration

The Ruby reference does not own application transactions or depend on Rails.

For Rails, the runtime integration lives in `adapters/rails/`. Call AuditSpec from the service/domain transaction that owns the mutation, or persist durable AuditSpec outbox intent inside that transaction when the final sink is external.

Rails static source analysis is a separate Inspector plugin capability and does not change Ruby reference semantics.

See:

- `adapters/rails/README.md`
- `profiles/atomicity/README.md`
- `lab/postgres-atomicity/`

## Tests

```bash
cd implementations/ruby
bundle install
bundle exec rake test
```

The test suite consumes the same valid/invalid Core and non-Core fixtures as the Python and TypeScript implementations.

CI runs the suite on Ruby 3.4.10 and Ruby 4.0.6.
