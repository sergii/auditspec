# AuditSpec MCP Server

AuditSpec exposes the same validation, Inspector, findings, remediation, verification, control mapping, and assessment-diff engine over Model Context Protocol. MCP is an adapter surface, not a second implementation of AuditSpec semantics.

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

### `auditspec.validate_event`

Validate one AuditSpec Core event against the canonical v0.1 schema.

### `auditspec.validate_agent_profile`

Validate `dev.auditspec.agent` profile data.

### `auditspec.inspect`

Inspect a local repository visible to the MCP server process and return a canonical Assessment Report. Current adapters are heuristic Rails and Frappe analyzers.

### `auditspec.get_findings`

Inspect a repository and return a compact findings list, optionally filtered by `rule_id`.

### `auditspec.explain_gap`

Return a stable explanation and remediation guidance for an Inspector rule.

### `auditspec.diff_assessments`

Compare two already-produced Assessment Reports using stable finding fingerprints. This is the same ratchet model used by the GitHub Action.

### `auditspec.plan_remediation`

Turn open findings in an Assessment Report into a machine-readable Remediation Plan. A plan contains rule-aware actions, rationale, acceptance criteria, affected files, and an explicit verification expectation.

The tool does **not** write source code. It is designed to hand a structured plan to a coding agent or developer that has separate write authority.

### `auditspec.verify_remediation`

Compare before/after Assessment Reports and verify whether requested finding fingerprints disappeared. The result distinguishes:

- `resolved_fingerprints`
- `still_open_fingerprints`
- `new_findings`
- coverage delta
- `verified`, `partial`, or `not_verified`

Verification is explicitly scoped to the active Inspector adapters. It does not claim that absence of a static finding proves runtime behavior or compliance.

### `auditspec.map_controls`

Map Assessment findings through a versioned Control Mapping Profile. The output connects concrete finding fingerprints to external control IDs using `potential_gap` or `relevant_evidence` relationships.

The tool never returns control pass/fail or certification status. The first repository profile targets NIST SP 800-53 Release 5.2.0.

## Intended agent loop

```text
agent
  |
  +--> auditspec.inspect
  |       |
  |       v
  |    findings + evidence + confidence
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
          |
          v
       control relevance / evidence bridge
```

This separation is intentional:

1. AuditSpec discovers and explains evidence-backed gaps.
2. A coding agent or developer decides whether and how to change code.
3. AuditSpec re-assesses the result.
4. Verification states only what the active evidence can support.
5. Control mapping translates evidence relevance without pretending to perform certification.

The MCP server deliberately does not modify source code in v0.1. This keeps assessment and evidence separate from code-writing authority.

## Next surfaces

Planned after the current loop:

- `auditspec.export_oscal`
- `auditspec.query_evidence`

OSCAL export should represent AuditSpec observations, evidence, findings, and assessment subjects without turning Inspector heuristics into certification claims. It must require real Assessment Plan/SSP context rather than inventing it.

A future hosted HTTP transport can expose the same server factory. The initial reference uses stdio because it is local, simple, and keeps repository source on the user's machine.
