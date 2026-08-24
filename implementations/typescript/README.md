# TypeScript reference implementation

This directory contains the executable TypeScript reference for AuditSpec v0.1. The normative source of truth remains the repository JSON Schemas and `SPEC.md`.

## Library API

```ts
import {
  assertAuditEvent,
  assertAssessmentReport,
  validateAuditEvent,
  validateAssessmentReport,
  validateAgentProfile,
  normalizeAuditEvent,
  redactAuditEvent,
  toCloudEvent,
  fromCloudEvent,
  inspectRepository,
} from "@auditspec/reference-typescript";
```

### Validation

`validateAuditEvent(value)` validates against `schema/audit-event.schema.json` with RFC 3339 date-time format checking enabled. `assertAuditEvent(value)` throws on invalid input.

`validateAgentProfile(value)` validates `dev.auditspec.agent` extension data against the Agent Profile schema.

`validateAssessmentReport(value)` validates the framework-neutral Inspector output contract in `schema/assessment-report.schema.json`.

### Normalization

`normalizeAuditEvent(event)` recursively sorts JSON object keys to produce deterministic reference output. It does **not** claim RFC 8785/JCS canonicalization and MUST NOT be used as a signing format.

### Redaction

`redactAuditEvent(event, policy)` returns a clone, replaces or omits configured sensitive keys/paths, and appends explicit Core `redactions[]` records. The built-in key list is intentionally conservative and is not a substitute for application-specific data classification.

### CloudEvents

`toCloudEvent(event)` maps the AuditSpec event into a CloudEvents 1.0 envelope while preserving the full AuditSpec event as `data`. `fromCloudEvent(envelope)` validates the payload and rejects identity mismatches between envelope and payload.

### Repository inspection

`inspectRepository(path)` returns an AuditSpec Assessment Report:

```text
repository
  -> detected frameworks
  -> auditable boundaries
  -> evidence
  -> findings
  -> coverage + confidence
```

The first adapter is `rails-heuristic-v0.1`. It detects common Active Record mutation calls and emits advisory findings for:

- `AS-AUDIT-001` - mutation with no visible AuditSpec emission marker
- `AS-ATOMIC-001` - audit + mutation without a visible transaction marker
- `AS-AUTH-001` - privileged-looking mutation without visible authorization evidence

These are source heuristics, not proofs. Every finding includes confidence, and the initial inspector recommends non-blocking use. Future AST/call-graph/runtime adapters can increase confidence without changing the Assessment Report format.

## CLI

The package builds an `auditspec` executable:

```bash
auditspec validate event.json
auditspec validate-agent agent-profile.json
auditspec normalize event.json
auditspec redact event.json
auditspec to-cloudevent event.json
auditspec inspect .
auditspec inspect . --json
```

`validate` and `validate-agent` exit with status `1` for invalid input and `0` for valid input, which makes them directly usable in CI scripts.

`inspect` is advisory in v0.1 and exits successfully when findings exist. CI/GitHub integrations should decide separately whether any configured class of **new** finding should become blocking.

## Run

```bash
npm install
npm run check
```

The tests consume the repository-wide conformance corpus so the TypeScript implementation cannot silently diverge from the normative schema.

## Packaging status

This is a repository-local reference implementation during the v0.1 draft. Publishing to npm, generated types, browser/runtime portability, and a stable storage-neutral emitter interface come after the semantic and conformance surface stabilizes.
