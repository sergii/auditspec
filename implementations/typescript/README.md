# TypeScript reference implementation

This directory contains the executable TypeScript reference for AuditSpec v0.1. The normative source of truth remains the repository JSON Schemas and `SPEC.md`.

## API

```ts
import {
  assertAuditEvent,
  validateAuditEvent,
  validateAgentProfile,
  normalizeAuditEvent,
  redactAuditEvent,
  toCloudEvent,
  fromCloudEvent,
} from "@auditspec/reference-typescript";
```

### Validation

`validateAuditEvent(value)` validates against `schema/audit-event.schema.json` with RFC 3339 date-time format checking enabled. `assertAuditEvent(value)` throws on invalid input.

`validateAgentProfile(value)` validates `dev.auditspec.agent` extension data against the Agent Profile schema.

### Normalization

`normalizeAuditEvent(event)` recursively sorts JSON object keys to produce deterministic reference output. It does **not** claim RFC 8785/JCS canonicalization and MUST NOT be used as a signing format.

### Redaction

`redactAuditEvent(event, policy)` returns a clone, replaces or omits configured sensitive keys/paths, and appends explicit Core `redactions[]` records. The built-in key list is intentionally conservative and is not a substitute for application-specific data classification.

### CloudEvents

`toCloudEvent(event)` maps the AuditSpec event into a CloudEvents 1.0 envelope while preserving the full AuditSpec event as `data`. `fromCloudEvent(envelope)` validates the payload and rejects identity mismatches between envelope and payload.

## Run

```bash
npm install
npm run check
```

The tests consume the repository-wide conformance corpus so the TypeScript implementation cannot silently diverge from the normative schema.

## Packaging status

This is a repository-local reference implementation during the v0.1 draft. Publishing to npm, generated types, browser/runtime portability, and a stable storage-neutral emitter interface come after the semantic and conformance surface stabilizes.
