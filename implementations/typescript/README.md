# TypeScript reference implementation

This directory contains the executable TypeScript reference for the AuditSpec v0.3 development line. The package version is `0.3.0-dev.3`; the latest tagged repository release remains `v0.2.0`. The normative Core event contract remains `spec_version: "0.1"`; repository/implementation versions do not imply a Core schema version.

## Library API

The package root exposes the intentionally stable implementer surface: Core event types/validation, normalization/redaction, delivery identity, Core interoperability projections, quickstart helpers, and corpus conformance. Inspector/runtime/assurance/control/MCP/identity-research APIs require the explicit `@auditspec/reference-typescript/experimental` entrypoint.

Stable root examples:

```ts
import {
  validateAuditEvent,
  normalizeAuditEvent,
  redactAuditEvent,
  toCloudEvent,
  runConformanceCorpus,
} from "@auditspec/reference-typescript";
```

Experimental examples:

```ts
import {
  inspectRepository,
  buildAssuranceGraph,
  corroborateAssessment,
  evaluateHumanMandate,
  createAuditSpecMcpServer,
} from "@auditspec/reference-typescript/experimental";
```

See `../../docs/api-stability.md` and `api-surface.json` for the enforced classification. Current development/release metadata is declared in `../../release/metadata.json`.

`normalizeAuditEvent(event)` produces deterministic reference output but does **not** claim RFC 8785/JCS canonicalization and MUST NOT be used as a signing format.

`redactAuditEvent(event, policy)` returns a clone, applies configured redaction and appends explicit Core `redactions[]` records.

`toCloudEvent(event)` preserves the full AuditSpec event as CloudEvents `data`; `fromCloudEvent` validates identity consistency.

## Inspector

`inspectRepository(path)` returns the framework-neutral Assessment Report used by CLI, GitHub Action and MCP. Current adapters cover Rails and Frappe/ERPNext with explicit heuristic confidence.

## CLI

```bash
auditspec init-example audit-event.json
auditspec validate event.json
auditspec validate event.json --human
auditspec explain event.json
auditspec explain event.json --json
auditspec conformance ./events/
auditspec conformance ./events/ --json
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

### First-time implementer path

`init-example`, human-readable validation, and `explain` form the smallest supported adoption loop:

```text
create -> validate -> explain -> edit -> validate
```

The default `validate` output remains machine-readable JSON for compatibility. `--human` adds concise PASS/FAIL output without changing exit-code semantics.

`init-example` refuses accidental overwrite unless `--force` is passed explicitly.

See `../../examples/external-implementer/README.md` and `../../docs/core-decision-guide.md`.

### Implementer corpus runner

`auditspec conformance <path>` validates either one JSON file or every regular `.json` file recursively under a directory.

The default output is human-readable and expands only failures. `--json` emits the versioned Conformance Corpus Report contract from `schema/conformance-corpus-report.schema.json`.

The report uses portable relative paths and deterministic ordering so the same corpus produces stable machine-readable output across working directories. Non-JSON files and symbolic links are not traversed.

The command exits non-zero when any event is invalid, when JSON parsing fails, or when a directory contains no JSON events.

Inspector findings remain advisory in the v0.3 development line. The CLI does not treat findings as command failure by default.

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

The TypeScript reference remains repository-local and `private`; no npm package is published. The package export map already restricts library imports to the stable root and explicit `./experimental` subpath; internal modules are not package exports. The package/server version remains independent from Core event `spec_version`.
