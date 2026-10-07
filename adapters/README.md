# AuditSpec adapters

AuditSpec adapters are extensions that project AuditSpec Core into a concrete framework or application runtime. They are not part of Core semantics and MUST NOT redefine the AuditSpec event model.

The dependency direction is intentional:

```text
AuditSpec Core <- language reference / SDK <- runtime adapter
AuditSpec Core <- Inspector Core <- Inspector plugin
```

Core MUST NOT depend on a framework adapter or Inspector plugin. An adapter or plugin MAY depend on Core contracts and shared reference tooling.

Runtime integration and static inspection are separate capabilities. A framework may implement either one without implementing the other.

## Capability layers

A framework integration can describe the following proof layers independently in `adapters/<framework>/adapter.json`.

### L0 - language reference

The framework reuses a conforming AuditSpec language implementation and the root JSON Schemas.

Requirements:

- no forked event schema;
- shared valid/invalid conformance corpus;
- validation before persistence;
- framework helpers may add ergonomics, not new Core meanings.

Language references live under `implementations/`, not under `adapters/`.

### L1 - runtime transaction adapter

Provides same-store and/or durable-outbox primitives that join the transaction owned by the framework/application.

Requirements:

- MUST NOT hide an implicit commit inside `emit` / `stage_outbox`;
- same-store audit persistence failure MUST be able to fail the caller's transaction when the framework supports rollback;
- outbox persistence MUST occur before any after-commit publisher wake-up is registered;
- after-commit callbacks are wake-up optimizations, not delivery durability;
- special non-rollbackable operations MUST be represented explicitly rather than upgraded to atomic assurance.

Current runtime adapters:

- Rails: `adapters/rails/auditspec_rails.rb`
- Frappe: `adapters/frappe/auditspec_frappe.py`

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

Current labs:

- Rails / ActiveRecord: `lab/rails-atomicity/`
- Frappe / Bench + MariaDB: `lab/frappe-bench-atomicity/`

The Frappe lab is a pinned framework-runtime proof for real database, after-commit, request, and background-job transaction semantics. Its request/job executors run in-process; external HTTP transport, Redis/RQ enqueue/worker process behavior, and production deployment specifics remain outside the current lab boundary. The adapter contract and shared language conformance tests cover validation and logical-event identity separately from the heavier Bench runtime proof.

### L3 - Inspector plugin

Discovers framework-specific mutation, authorization, transaction, and entrypoint evidence and projects it into generic AuditSpec Assessment / Assurance contracts.

Inspector plugins are not runtime adapters. They belong to the Inspector extension layer and MUST preserve uncertainty instead of inventing framework-independent certainty from framework-specific syntax.

Requirements:

- AST/framework evidence must preserve uncertainty;
- unresolved dispatch must not become positive evidence;
- static reachability must not be described as runtime execution;
- alternate weaker paths must not be hidden by one stronger path;
- framework-specific special cases should lower confidence or fail closed rather than be guessed away;
- Inspector Core MUST NOT import framework-specific semantics directly once a plugin boundary exists for them.

Current Inspector plugins:

- `rails-ast-assisted-v0.1`
- `frappe-ast-assisted-v0.1`

The TypeScript reference currently hosts these plugins under `implementations/typescript/src/inspector/plugins/`. Further Assurance Graph extraction is part of the v0.2 architecture work.

### L4 - runtime corroboration

Optional evidence from the running application, database, message bus, kernel/runtime probes, or signed producer receipts can corroborate static assurance paths.

Runtime evidence must retain provenance and trust. It supplements static analysis; it does not retroactively change what the source analysis actually proved.

## Cross-adapter invariants

All adapters and plugins should preserve these invariants:

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

A new framework extension should normally arrive in independently reviewable pieces:

1. reuse an existing language reference implementation, or add a new conforming language implementation;
2. document the framework's transaction and request/job lifecycle from primary sources;
3. add an L1 runtime adapter only when transaction semantics can be stated conservatively;
4. add failure-injection tests for runtime claims;
5. add an Inspector plugin for source/framework semantics when useful;
6. add a pinned real-world smoke repository for static claims;
7. only then consider runtime corroboration.

A framework version change should normally release or update that framework extension. It should not require a new AuditSpec Core version unless the universal semantic contract itself changes.
