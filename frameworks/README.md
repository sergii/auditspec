# AuditSpec framework adapter contract

Framework integrations are projections of AuditSpec Core into a concrete application runtime. They must not redefine event semantics or create framework-specific versions of the Core schema.

## Layers

A framework integration can implement the following layers independently.

### L0 - language reference

The framework reuses a conforming AuditSpec language implementation and the root JSON Schemas.

Requirements:

- no forked event schema;
- shared valid/invalid conformance corpus;
- validation before persistence;
- the framework may add helpers, not new Core meanings.

### L1 - transaction adapter

Provides same-store and/or durable-outbox primitives that join the transaction owned by the framework/application.

Requirements:

- MUST NOT hide an implicit commit inside `emit` / `stage_outbox`;
- same-store audit persistence failure MUST be able to fail the caller's transaction when the framework supports rollback;
- outbox persistence MUST occur before any after-commit publisher wake-up is registered;
- after-commit callbacks are wake-up optimizations, not delivery durability;
- special non-rollbackable operations MUST be represented explicitly rather than upgraded to atomic assurance.

Current implementations:

- Rails: `frameworks/rails/auditspec_rails.rb`
- Frappe: `frameworks/frappe/auditspec_frappe.py`

### L2 - behavioral transaction lab

Executes failure-injection tests against the real framework/database transaction lifecycle where practical.

Minimum cases:

1. successful business mutation + audit/outbox commit together;
2. audit persistence failure rolls back the mutation;
3. outbox persistence failure rolls back the mutation;
4. invalid audit input is rejected before mutation;
5. rollback suppresses after-commit publication;
6. publisher failure after commit leaves durable retry intent;
7. retry preserves one logical event identity.

Current lab:

- Rails / ActiveRecord: `lab/rails-atomicity/`

Frappe currently has L1 contract tests plus pinned real-world Inspector smoke. A full Bench runtime lab remains a separate heavier target.

### L3 - Inspector adapter

Discovers mutation and framework entrypoint evidence without changing Core semantics.

Requirements:

- AST/framework evidence must preserve uncertainty;
- unresolved dispatch must not become positive evidence;
- static reachability must not be described as runtime execution;
- alternate weaker paths must not be hidden by one stronger path;
- framework-specific special cases should lower confidence rather than be guessed away.

Current adapters:

- `rails-ast-assisted-v0.1`
- `frappe-ast-assisted-v0.1`

### L4 - runtime corroboration

Optional future evidence from the running application, database, message bus, kernel/runtime probes, or signed producer receipts can corroborate static assurance paths.

Runtime evidence must retain provenance and trust. It supplements static analysis; it does not retroactively change what the source analysis actually proved.

## Cross-framework invariants

All framework adapters should preserve these invariants:

- Core JSON remains portable between implementations.
- Immediate actor and delegation are never collapsed.
- Authorization decision and execution result remain separate facts.
- Redaction occurs before persistence/export.
- `(source, id)` remains the logical event identity.
- A duplicate identity with a different canonical payload is a conflict.
- Atomicity claims are scoped to an actual transaction boundary.
- External delivery is at-least-once unless a stronger transport profile explicitly proves otherwise.
- Compliance/control mappings remain relevance/evidence mappings, not framework-generated certification.

## Adding another framework

A new adapter should normally arrive in this order:

1. reuse a language reference implementation;
2. document the framework's transaction and request/job lifecycle from primary sources;
3. implement L1 without hidden commits;
4. add failure-injection tests;
5. add Inspector entrypoint/mutation surfaces;
6. add a pinned real-world smoke repository;
7. only then consider runtime corroboration.

This sequencing keeps AuditSpec useful from day one while preventing framework convenience APIs from weakening the semantic or assurance model.
