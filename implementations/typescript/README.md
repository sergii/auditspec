# TypeScript reference implementation

This directory contains the executable TypeScript reference for AuditSpec v0.1. The normative source of truth remains the repository JSON Schemas and `SPEC.md`.

## Library API

The package exposes Core validation, normalization, redaction, delivery identity, CloudEvents and OpenTelemetry mappings, repository inspection, Assurance Graph construction/diff/path queries, assessment diffing, remediation planning/verification, control mapping, static evidence queries, runtime corroboration/query/diff, runtime producer registries/adapters, OSCAL projection, W3C PROV projection, and MCP server construction.

Important functions include:

```ts
validateAuditEvent(value)
validateAssessmentReport(value)
validateAgentProfile(value)
inspectRepository(path)
buildAssuranceGraph(path)
diffAssuranceGraphs(base, head)
findAssurancePath(graph, location)
diffAssessments(base, head)
planRemediation(assessment)
verifyRemediation(base, head)
mapAssessmentToControls(assessment, profile)
queryEvidence(assessment, filters)
corroborateAssessment(assessment, evidence)
diffCorroborationReports(base, head)
queryCorroboration(report, filters)
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
auditspec graph .
auditspec graph-diff ./base-worktree ./head-worktree
auditspec assurance-path . app/services/approve_invoice.rb 12 5
auditspec diff-assessments base.json head.json
auditspec plan-remediation assessment.json
auditspec verify-remediation before.json after.json
auditspec map-controls assessment.json mapping-profile.json
auditspec query-evidence assessment.json --rule AS-AUDIT-001 --source finding
auditspec corroborate assessment.json runtime-evidence.json
auditspec diff-corroboration base-corroboration.json head-corroboration.json
auditspec query-corroboration corroboration.json --relation contradicts --trust authoritative
auditspec export-oscal assessment.json ./assessment-plan.json
```

Inspector findings are advisory in v0.1. The CLI does not treat findings as command failure by default.

## Runtime evidence

The TypeScript reference includes runtime evidence adapters for explicitly targeted OpenTelemetry observations, authorization decisions, database receipts, and delivery receipts. Producer capabilities and authority limits are machine-readable in `runtime/producers/*.json` and exposed through the runtime producer registry and MCP tools.

Runtime corroboration is separate from static Assessment coverage. One observation does not upgrade a static path to `covered`, and a bounded non-observation is not treated as proof that a path never executes.

## OSCAL

The OSCAL exporter targets Assessment Results `1.2.3` and requires explicit caller-supplied Assessment Plan, reviewed-control, and finding-target/status context. It is an interoperability projection, not a compliance verdict.

CI generates an Assessment Results document, downloads the pinned official NIST OSCAL v1.2.3 release archive, verifies its SHA-256 digest, and validates the generated document against the complete official Assessment Results JSON Schema.

## Run

```bash
npm install
npm run check
```

Tests consume repository-wide conformance artifacts so the TypeScript implementation cannot silently define a separate AuditSpec contract.

## Packaging status

This remains a repository-local reference implementation during the v0.1 draft. npm publication and stronger multi-runtime packaging come after the semantic/conformance surface stabilizes.
