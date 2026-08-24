# AuditSpec MCP Server

AuditSpec exposes validation, framework capability discovery, Inspector, Assurance Graph, topology diff, findings, remediation, verification, evidence query, runtime corroboration, control mapping, OSCAL projection, and assessment diff over Model Context Protocol. MCP is an adapter surface, not a second implementation of AuditSpec semantics.

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
- `auditspec.list_framework_adapters` - list schema-valid framework manifests and their implemented/partial/planned proof layers, optionally filtered by framework.
- `auditspec.inspect` - inspect a local repository and return an Assessment Report.
- `auditspec.build_assurance_graph` - build a conservative cross-file static Assurance Graph with supported framework dispatch edges.
- `auditspec.diff_assurance_graphs` - compare two repository graphs and report topology changes such as new entrypoints, framework dispatches, and mutation paths.
- `auditspec.find_assurance_path` - return the best resolved assurance path for a repository-relative source location.
- `auditspec.get_findings` - return compact findings, optionally filtered by rule.
- `auditspec.explain_gap` - explain a stable Inspector rule.
- `auditspec.diff_assessments` - compare base/head reports using finding and boundary fingerprints, including reachability deltas.
- `auditspec.plan_remediation` - create a structured remediation plan without modifying source.
- `auditspec.verify_remediation` - verify requested finding fingerprints against a later assessment.
- `auditspec.map_controls` - map evidence/findings to external controls without pass/fail claims.
- `auditspec.query_evidence` - query evidence already present in an Assessment Report.
- `auditspec.corroborate_runtime` - compare static Assessment targets with schema-valid runtime observations without rewriting static coverage.
- `auditspec.export_oscal` - project an Assessment Report into OSCAL 1.2.3 Assessment Results using an explicit validated export request.

## Intended agent loop

```text
agent
  |
  +--> auditspec.list_framework_adapters
  |       |
  |       v
  |    available adapter layers + proof + limitations
  |
  +--> auditspec.inspect
  |       |
  |       v
  |    findings + static evidence + confidence
  |
  +--> auditspec.build_assurance_graph
  |       |
  |       v
  |    calls + route/hook/job/queue dispatch + unresolved calls
  |
  +--> auditspec.diff_assurance_graphs
  |       |
  |       v
  |    new entrypoints + dispatches + mutation paths
  |
  +--> auditspec.find_assurance_path
  |       |
  |       v
  |    entrypoint/auth/transaction/mutation/audit path
  |
  +--> auditspec.query_evidence
  |       |
  |       v
  |    focused static evidence projection
  |
  +--> auditspec.corroborate_runtime
  |       |
  |       v
  |    supports / contradicts / inconclusive / unmatched
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
  +--> assessor/GRC context
  |
  +--> auditspec.export_oscal
          |
          v
       NIST-schema-valid OSCAL Assessment Results
```

## Framework capability boundary

`auditspec.list_framework_adapters` reads `frameworks/*/adapter.json`, validated against `schema/framework-adapter-manifest.schema.json`.

The manifests separate five proof layers:

1. language reference implementation;
2. transaction adapter;
3. behavioral framework runtime lab;
4. Inspector adapter;
5. runtime corroboration.

For example, Rails currently has an executable ActiveRecord behavioral lab, while Frappe deliberately reports its full Bench runtime lab as incomplete. An agent can therefore use available integration primitives without silently upgrading a contract test into runtime proof.

## Assurance Graph boundary

The Assurance Graph is static-source evidence. It deliberately leaves ambiguous dynamic calls unresolved rather than inventing edges. It does not prove runtime execution or complete reachability.

Supported framework provenance currently includes explicit Rails routes, ActiveJob/Sidekiq dispatch, Frappe whitelisted functions, `doc_events`, `scheduler_events`, and dotted `frappe.enqueue` targets. Framework edges retain their declaration/call locations so agents can explain why a path exists.

`auditspec.diff_assurance_graphs` is deliberately separate from Assessment Diff. It compares architecture topology by stable semantic identities rather than source line numbers. A new route to an existing mutation can therefore appear as a new topology path even when the mutation source and its existing finding fingerprint did not change.

See `docs/assurance-graph.md` for graph, topology-diff, and confidence contracts.

## Runtime corroboration boundary

`auditspec.corroborate_runtime` accepts:

- `assessment` - a valid static Assessment Report;
- `evidence` - an array of individually valid `RuntimeEvidenceRecord` objects.

The tool returns a schema-valid Corroboration Report. Runtime observations are matched only to stable boundary/finding fingerprints explicitly present in the evidence record. Unknown targets remain unmatched.

The relation rules are conservative:

```text
observed
  -> supports

contradicted
  -> contradicts

not_observed + exhaustive coverage
  -> contradicts

not_observed + point/sample/window coverage
  -> inconclusive
```

Producer trust and observation coverage are preserved separately. Runtime evidence does not mutate the Assessment Report or automatically increase static audit coverage.

See `docs/runtime-corroboration.md` for producer trust, observation coverage, OpenTelemetry/database/eBPF boundaries, and future correlation rules.

## OSCAL boundary

`auditspec.export_oscal` accepts:

- `assessment` - a valid AuditSpec Assessment Report;
- `request` - a valid `schema/oscal-export-request.schema.json` object.

The request supplies assessment context that AuditSpec must not infer:

- governing `assessment_plan_href`;
- `reviewed_control_ids` actually assessed;
- `finding_targets` keyed by AuditSpec finding fingerprint, including OSCAL target type/id and caller/assessor `satisfied` or `not-satisfied` status.

AuditSpec maps its technical observations/evidence and preserves rule IDs, fingerprints, severity and confidence, but it does not invent a compliance verdict, certification decision, risk acceptance, reviewed scope, or assessor conclusion.

The generated document is validated in CI against the complete official NIST OSCAL v1.2.3 Assessment Results JSON Schema from a SHA-256-pinned NIST release archive. Structural OSCAL conformance is therefore executable; factual correctness of the external AP/SSP/control context remains the caller/assessor's responsibility.

## Evidence boundary

`auditspec.query_evidence` queries evidence already present in an Assessment Report. It does not rescan source or silently strengthen confidence. This makes it suitable for agent reasoning while preserving provenance.

## Write authority

The MCP server deliberately does not modify source code in v0.1. Assessment/evidence and code-writing authority stay separate: AuditSpec can recommend and verify, while a coding agent or developer performs changes through separately authorized tools.

## Next surfaces

- richer Rails resources, namespaces, callbacks and generated dispatch
- richer Frappe dynamic hooks and background dispatch resolution
- full pinned Frappe Bench behavioral runtime lab
- message-bus/RPC edges
- OpenTelemetry runtime evidence producer adapter
- database/outbox/delivery receipt producer adapters
- graph visualization and richer graph/evidence queries
- optional kernel/eBPF corroboration as evidence, never as a replacement for semantic application audit

A future hosted HTTP transport can expose the same server factory. The initial reference uses stdio because it is local, simple, and keeps repository source on the user's machine.
