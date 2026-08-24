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
  diffAssessments,
  planRemediation,
  verifyRemediation,
  mapAssessmentToControls,
} from "@auditspec/reference-typescript";
```

### Validation

`validateAuditEvent(value)` validates against `schema/audit-event.schema.json` with RFC 3339 date-time format checking enabled. `assertAuditEvent(value)` throws on invalid input.

`validateAgentProfile(value)` validates `dev.auditspec.agent` extension data against the Agent Profile schema.

`validateAssessmentReport(value)` validates the framework-neutral Inspector output contract in `schema/assessment-report.schema.json`.

Remediation plans, remediation verification results, control mapping profiles, and control mapping results also have canonical JSON Schemas and validators.

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

Current adapters include heuristic Rails and Frappe/ERPNext analysis. Findings are source-analysis evidence, not proof of complete system behavior. Every finding includes confidence, and the initial inspector recommends non-blocking use.

### Remediation planning

`planRemediation(assessment, fingerprints?)` converts open findings into a machine-readable plan with:

- rule-aware actions
- rationale
- acceptance criteria
- affected file hints
- explicit verification expectation

The planner does not write code.

`verifyRemediation(base, head, fingerprints?)` compares stable finding fingerprints across assessments and returns `verified`, `partial`, or `not_verified`, plus resolved/still-open/new findings and coverage delta.

Verification is scoped to active Inspector evidence. It does not claim runtime proof or compliance.

### Control mapping

`mapAssessmentToControls(assessment, profile)` maps active AuditSpec findings through a versioned external control profile.

A mapping result contains:

- external control identifiers
- AuditSpec rule identifiers
- concrete finding fingerprints
- `potential_gap` or `relevant_evidence` relationships
- rationale and an explicit non-certification caveat

The first built-in profile targets NIST SP 800-53 Release 5.2.0. Control mappings express evidence relevance only. They do not turn an AuditSpec assessment into a compliance pass/fail result.

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
auditspec diff-assessments base.json head.json
auditspec plan-remediation assessment.json
auditspec verify-remediation base.json head.json
auditspec map-controls assessment.json mappings/controls/nist-sp800-53-r5.2.0.json
```

`validate` and `validate-agent` exit with status `1` for invalid input and `0` for valid input, which makes them directly usable in CI scripts.

`inspect` is advisory in v0.1 and exits successfully when findings exist. CI/GitHub integrations should decide separately whether any configured class of **new** finding should become blocking.

## MCP

The same engine is exposed over MCP. See `docs/mcp.md`. MCP assessment/remediation/control-mapping tools do not duplicate business logic and do not write source code in v0.1.

## Run

```bash
npm install
npm run check
```

The tests consume the repository-wide conformance corpus so the TypeScript implementation cannot silently diverge from the normative schema.

## Packaging status

This is a repository-local reference implementation during the v0.1 draft. Publishing to npm, generated types, browser/runtime portability, and a stable storage-neutral emitter interface come after the semantic and conformance surface stabilizes.
