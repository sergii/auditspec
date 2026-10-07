# Changelog

AuditSpec follows explicit specification and implementation versions. The Core `spec_version` remains independent from packaging/version metadata used by reference implementations.

## v0.3.0 - Unreleased

### Adoption and conformance

- Added the first external-implementer quickstart centered on one valid Core event.
- Added `auditspec init-example` with overwrite protection.
- Added optional human-readable `auditspec validate ... --human` output while preserving machine-readable JSON as the default.
- Added `auditspec explain` and `--json` explanation projection for the semantic fields a first-time implementer needs to understand.
- Added executable tests that keep the generated starter event, checked-in example, validation result, and explanation output aligned.
- Added `auditspec conformance <path>` for deterministic recursive validation of implementer-owned Core event corpora.
- Added human and `--json` corpus summaries, stable relative file ordering, explicit malformed-JSON accounting, and non-zero failure for empty corpora.
- Added the versioned `schema/conformance-corpus-report.schema.json` machine-readable CI contract.
- Added machine-readable stable/experimental/internal TypeScript API classification and CI drift checks.
- Restricted the package root to explicitly named stable Core/adoption/interoperability symbols and moved Inspector/runtime/research APIs behind `@auditspec/reference-typescript/experimental`.
- Removed internal parser/framework plumbing from package exports and updated the GitHub Action to consume Inspector through the experimental entrypoint.
- Added a packed-package external sample application that emits, validates, explains, and corpus-checks a real Core event using only the stable package root.
- Added CI that copies the sample outside the repository, installs an `npm pack` artifact, and verifies internal package subpaths remain inaccessible.
- Core remains `spec_version: "0.1"`; these are adoption surfaces, not a Core schema revision.

## v0.2.0 - 2026-10-07

Second public AuditSpec repository release line.

### Compatibility and versioning

- The repository release advances to v0.2.0 while the normative Core audit-event contract remains `spec_version: "0.1"`.
- Added `docs/versioning.md` to separate repository, implementation, artifact/schema, Inspector/adapter, and external-standard version planes.
- The TypeScript reference and MCP implementation are versioned `0.2.0`; the package remains private and unpublished.
- No Core producer is required to emit `spec_version: "0.2"`.

### Architecture, Inspector, and runtime assurance

- Formalized the extension boundary between Core, language references, runtime adapters, Inspector Core, framework plugins, source scanners, and behavioral labs.
- Deepened Rails and Frappe/ERPNext discovery while preserving unresolved/unknown outcomes for ambiguous dynamic behavior.
- Expanded Assurance Graph/all-path analysis, topology diffs, remediation planning/verification, runtime corroboration, observation scope, producer registries, and evidence query/diff surfaces.
- Added stronger framework/runtime capability manifests and pinned real-world regression coverage.
- Preserved advisory Inspector semantics and explicit producer authority boundaries.

### Identity and delegated-agent research

- Added executable RFC 8693 actor/delegation projection with negative invariants for `may_act`, `scope`, `aud`, and `client_id`.
- Added RFC 9421 HTTP Message Signature and RFC 9449 DPoP request-evidence projections that keep request/key evidence separate from actor/delegation/authorization semantics.
- Added cross-spec information-loss fixtures for OAuth Identity Chaining, Transaction Tokens, and Transaction Tokens For Agents.
- Added monotonic assurance attenuation to prevent identity laundering across semantic dependencies.

### Human mandate and concrete-action authorization research

- Added deterministic HumanMandate evaluation with hard constraints, escalation boundaries, agent/time binding, and fail-closed unverifiable outcomes.
- Added RFC 8785 + SHA-256 + Ed25519 signed HumanMandate proofs with structural conformance and tamper tests.
- Added AAE -02 and Intent Token -02 mandate-binding research profiles with explicit source-protocol trust inputs and fail-closed handling for unmapped required restrictions.
- Added an end-to-end composition harness joining request evidence, delegation, human authorization, mandate evaluation, signed proof, assurance attenuation, execution observation, and database commit evidence.
- Added adversarial whole-chain mutations for action tampering, actor substitution, weakened delegation, unrepresentable constraints, replay failure, expiry, and missing request-to-action binding.

### Assurance guardrails

- Stronger downstream evidence never upgrades weaker upstream provenance across an explicit semantic dependency.
- General agent authority is not concrete-action authority.
- A valid cryptographic proof binds a statement, not unlimited signer authority.
- Authorization projection must not widen authority by dropping required source restrictions.
- Independently valid adjacent artifacts do not create a principal/actor/action binding by coincidence.

### Reliability and interoperability

- Continued PostgreSQL, Rails/ActiveRecord, and Frappe Bench/MariaDB atomicity/failure-injection coverage.
- Continued shared TypeScript/Ruby/Python Core conformance.
- Continued CloudEvents, OpenTelemetry, W3C PROV, control-mapping, and official pinned NIST OSCAL validation.

### Release status

- See `docs/release-v0.2.md` for the completed release gates and version boundaries.
- Draft-based identity/mandate mappings remain experimental research surfaces and are not protocol-conformance claims.

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
