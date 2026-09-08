# Changelog

AuditSpec follows explicit specification and implementation versions. The Core `spec_version` remains independent from packaging/version metadata used by reference implementations.

## v0.1 - 2026-09-08

First public AuditSpec release.

### Core and conformance

- Vendor-neutral Core audit-event contract for actors, delegation, actions, targets/subjects, authorization, results, changes, correlation, evidence, redaction, ordering, extensions, and delivery identity.
- JSON Schemas plus shared positive/negative conformance vectors.
- TypeScript, Ruby, and Python executable reference implementations consuming the same shared corpus.

### Inspector and assurance

- Conservative AST-assisted Inspector and cross-file Assurance Graph.
- Rails and Frappe/ERPNext framework adapters with machine-readable capability manifests and fail-closed handling for unresolved/dynamic constructs.
- All-path assurance evaluation, stable finding/boundary fingerprints, reachability/topology diffs, and advisory PR ratchets.
- Structured remediation planning and verification.

### Runtime evidence and interoperability

- Runtime corroboration model with observation scope, producer trust/authority, query/diff semantics, and static/runtime separation.
- Reference OpenTelemetry, authorization-decision, database-receipt, and delivery-receipt producers.
- CloudEvents, OpenTelemetry, W3C PROV, control mapping, and OSCAL interoperability surfaces.
- Official NIST OSCAL v1.2.3 Assessment Results schema validation in CI.

### Reliability proofs

- PostgreSQL failure-injection reference for same-store audit/outbox semantics and stable logical event identity.
- Rails ActiveRecord transaction/after-commit behavioral lab.
- Pinned Frappe Bench + MariaDB request/job transaction behavioral lab.
- Focused mutation assurance gate for the semantic evaluator.

### Distribution

- Advisory composite GitHub Action usable as `sergii/auditspec@v0.1` after the tag is published.
- Local MCP v2 server exposing Inspector, graph, remediation, evidence, runtime corroboration, producer registry, control mapping, and OSCAL tools.
- TypeScript reference remains repository-local/private in v0.1; no npm package is published.

### Compatibility note

AuditSpec v0.1 is an early public specification. Later `0.x` revisions may introduce breaking changes. Consumers that require stable behavior should pin the released `v0.1` tag or an immutable commit and should not infer support beyond the capability manifests and documented proof boundaries.
