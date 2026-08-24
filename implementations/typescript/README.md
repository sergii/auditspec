# TypeScript reference implementation

This directory contains the executable TypeScript reference for AuditSpec v0.1. The normative source of truth remains the repository JSON Schemas and `SPEC.md`.

## Library API

The package exposes Core validation, normalization, redaction, CloudEvents mapping, repository inspection, assessment diffing, remediation planning/verification, control mapping, evidence queries, OSCAL projection, and MCP server construction.

Important functions include:

```ts
validateAuditEvent(value)
validateAssessmentReport(value)
validateAgentProfile(value)
inspectRepository(path)
diffAssessments(base, head)
planRemediation(assessment)
verifyRemediation(base, head)
mapAssessmentToControls(assessment, profile)
queryEvidence(assessment, filters)
exportOscalAssessmentResults(assessment, request)
createAuditSpecMcpServer()
```

`normalizeAuditEvent(event)` produces deterministic reference output but does **not** claim RFC 8785/JCS canonicalization and MUST NOT be used as a signing format.

`redactAuditEvent(event, policy)` returns a clone, applies configured redaction and appends explicit Core `redactions[]` records.

`toCloudEvent(event)` preserves the full AuditSpec event as CloudEvents `data`; `fromCloudEvent` validates identity consistency.

## Inspector

`inspectRepository(path)` returns the framework-neutral Assessment Report used by CLI, GitHub Action and MCP. Current adapters cover Rails and Frappe/ERPNext with explicit heuristic confidence.

## CLI

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
auditspec verify-remediation before.json after.json
auditspec map-controls assessment.json mapping-profile.json
auditspec query-evidence assessment.json --rule AS-AUDIT-001 --source finding
auditspec export-oscal assessment.json ./assessment-plan.json
```

Inspector findings are advisory in v0.1. The CLI does not treat findings as command failure by default.

## OSCAL

The OSCAL exporter targets Assessment Results `1.2.3` and requires an explicit Assessment Plan href. It is an interoperability projection, not a compliance verdict. Complete official NIST JSON Schema validation is a release-hardening item and is not yet automated.

## Run

```bash
npm install
npm run check
```

Tests consume repository-wide conformance artifacts so the TypeScript implementation cannot silently define a separate AuditSpec contract.

## Packaging status

This remains a repository-local reference implementation during the v0.1 draft. npm publication and stronger multi-runtime packaging come after the semantic/conformance surface stabilizes.
