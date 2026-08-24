# AuditSpec MCP Server

AuditSpec exposes the same validation, Inspector, Assurance Graph, findings, remediation, verification, evidence query, control mapping, OSCAL projection, and assessment-diff engine over Model Context Protocol. MCP is an adapter surface, not a second implementation of AuditSpec semantics.

The reference server targets MCP specification `2026-07-28` through the stable `@modelcontextprotocol/server` v2 SDK.

## Run over stdio

```bash
cd implementations/typescript
npm install
npm run build
npm run mcp
```

Or run the built executable directly:

```bash
auditspec-mcp
```

Stdout is reserved for MCP protocol messages. Diagnostics go to stderr.

## Tools

- `auditspec.validate_event` - validate a Core event.
- `auditspec.validate_agent_profile` - validate Agent Profile data.
- `auditspec.inspect` - inspect a local repository and return an Assessment Report.
- `auditspec.build_assurance_graph` - build a conservative cross-file static Assurance Graph.
- `auditspec.find_assurance_path` - return the best resolved assurance path for a repository-relative source location.
- `auditspec.get_findings` - return compact findings, optionally filtered by rule.
- `auditspec.explain_gap` - explain a stable Inspector rule.
- `auditspec.diff_assessments` - compare base/head reports using finding fingerprints.
- `auditspec.plan_remediation` - create a structured remediation plan without modifying source.
- `auditspec.verify_remediation` - verify requested finding fingerprints against a later assessment.
- `auditspec.map_controls` - map evidence/findings to external controls without pass/fail claims.
- `auditspec.query_evidence` - query evidence already present in an Assessment Report.
- `auditspec.export_oscal` - project an Assessment Report into OSCAL 1.2.3 Assessment Results.

## Intended agent loop

```text
agent
  |
  +--> auditspec.inspect
  |       |
  |       v
  |    findings + evidence + confidence
  |
  +--> auditspec.build_assurance_graph
  |       |
  |       v
  |    resolved edges + unresolved calls
  |
  +--> auditspec.find_assurance_path
  |       |
  |       v
  |    entrypoint/auth/transaction/mutation/audit path
  |
  +--> auditspec.query_evidence
  |       |
  |       v
  |    focused evidence projection
  |
  +--> auditspec.plan_remediation
  |       |
  |       v
  |    actions + acceptance criteria
  |
  +--> coding tools / patch
  |
  +--> auditspec.inspect
  |       |
  |       v
  |    new assessment
  |
  +--> auditspec.verify_remediation
  |       |
  |       v
  |    resolved / still open / new gaps
  |
  +--> auditspec.map_controls
  |       |
  |       v
  |    control relevance / evidence bridge
  |
  +--> auditspec.export_oscal
          |
          v
       OSCAL Assessment Results projection
```

## Assurance Graph boundary

The Assurance Graph is static-source evidence. It deliberately leaves ambiguous dynamic calls unresolved rather than inventing edges. It does not prove runtime execution or complete reachability.

This separation lets an agent ask why a mutation is considered covered and inspect the exact resolved path without turning repository-wide coincidence into evidence.

See `docs/assurance-graph.md` for the contract and confidence model.

## OSCAL boundary

`auditspec.export_oscal` requires an explicit `assessment_plan_href`. OSCAL Assessment Results imports the governing Assessment Plan, so AuditSpec does not invent that assessment context.

The exporter maps Inspector findings into observations/findings and preserves AuditSpec rule IDs, fingerprints, severity, confidence and evidence. It does not emit a compliance verdict, certification decision, risk acceptance, or POA&M disposition.

The v0.1 exporter is implemented against the NIST OSCAL 1.2.3 JSON reference. Automated validation against the complete official NIST release JSON Schema is still pending and is tracked as a release-hardening task.

## Evidence boundary

`auditspec.query_evidence` queries evidence already present in an Assessment Report. It does not rescan source or silently strengthen confidence. This makes it suitable for agent reasoning while preserving provenance.

## Write authority

The MCP server deliberately does not modify source code in v0.1. Assessment/evidence and code-writing authority stay separate: AuditSpec can recommend and verify, while a coding agent or developer performs changes.

## Next surfaces

- framework-aware route, callback, job and message-bus graph edges
- runtime/OTel evidence ingestion
- official OSCAL schema validation in conformance
- graph visualization and richer evidence queries

A future hosted HTTP transport can expose the same server factory. The initial reference uses stdio because it is local, simple, and keeps repository source on the user's machine.
