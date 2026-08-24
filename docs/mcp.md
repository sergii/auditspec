# AuditSpec MCP Server

AuditSpec exposes the same validation, Inspector, findings, and assessment-diff engine over Model Context Protocol. MCP is an adapter surface, not a second implementation of AuditSpec semantics.

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

## Initial tools

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

## Intended agent loop

```text
agent
  |
  +--> auditspec.inspect
  |       |
  |       v
  |    findings + evidence + confidence
  |
  +--> auditspec.explain_gap
  |       |
  |       v
  |    remediation guidance
  |
  +--> coding tools / patch
  |
  +--> auditspec.inspect
          |
          v
       verify remediation
```

The MCP server deliberately does not modify source code in v0.1. Remediation remains an explicit coding-agent or developer action. This keeps assessment and evidence separate from code-writing authority.

## Future tools

Planned after the core Inspector becomes stronger:

- `auditspec.plan_remediation`
- `auditspec.verify_remediation`
- `auditspec.map_controls`
- `auditspec.export_oscal`
- `auditspec.query_evidence`

A future hosted HTTP transport can expose the same server factory. The initial reference uses stdio because it is local, simple, and keeps repository source on the user's machine.
