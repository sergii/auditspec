# Assurance Graph

AuditSpec Assurance Graph is a machine-readable static evidence graph for reasoning about whether a discovered mutation is connected to authorization, transaction, audit, and application entrypoint scopes.

It is an Inspector artifact, not part of the Core Audit Event envelope.

## Why it exists

File-level source scanning is too coarse for meaningful assurance. An audit call in another method of the same file must not make an unrelated mutation look covered, while a controller delegating to a service in another file should be able to contribute relevant evidence when that call can be resolved safely.

The graph models method/function scopes and conservative call edges so tools can reason about paths such as:

```text
controller action
  -> authorization
  -> service
  -> transaction
  -> mutation
  -> AuditSpec emission
```

## Contract

The canonical schema is `schema/assurance-graph.schema.json`.

A graph contains:

- `nodes` - Ruby method or Python function scopes.
- `edges` - statically resolved call relationships.
- `unresolved_calls` - ambiguous calls that AuditSpec deliberately refuses to guess.
- `roles` - `entrypoint`, `authorization`, `transaction`, `mutation`, and `audit` evidence attached to scopes.
- `confidence` - confidence in the static evidence represented by the graph.

The canonical example is `schema/examples/assurance-graph.json`.

## Conservative resolution

AuditSpec MUST prefer an unresolved call over a speculative edge.

The v0.1 reference implementation resolves a call when either:

1. its receiver identifies exactly one matching container/method candidate, or
2. only one repository-wide method/function candidate exists, in which case the edge is lower confidence.

If multiple candidates remain, the call is retained as unresolved evidence and MUST NOT strengthen audit coverage.

This is intentional. Ruby metaprogramming, Python dynamic dispatch, framework callbacks, dependency injection, generated methods, RPC, queues, and runtime routing can make static resolution incomplete.

## Assurance paths

`findAssurancePath` starts from a repository-relative source location and walks resolved incoming calls toward an entrypoint or the edge of the known graph. It reports the roles observed on the selected path and a confidence level.

A path with `audit` evidence may remove an `AS-AUDIT-001` gap for the corresponding mutation. A Rails path with both `audit` and `transaction` may support `covered` status. Authorization evidence can resolve `AS-AUTH-001` when it is on the same resolved path.

The graph does not claim that a path executed at runtime. It is static-source evidence only.

## CLI

```bash
auditspec graph .
auditspec assurance-path . app/services/approve_invoice.rb 12 5
```

Both commands return JSON so their output can be stored, diffed, visualized, or consumed by agents.

## MCP

The reference MCP server exposes:

- `auditspec.build_assurance_graph`
- `auditspec.find_assurance_path`

This lets an agent inspect a repository, ask for the evidence path behind a finding, propose remediation, re-inspect, and verify whether the relevant path changed.

## Evidence boundary

The Assurance Graph is not runtime proof, formal verification, or a complete program call graph. In v0.1 it is deliberately bounded static evidence.

Future evidence layers can strengthen or contradict it, including:

- framework-aware route/callback graphs
- background job and message-bus edges
- OpenTelemetry trace correlation
- runtime instrumentation
- kernel/eBPF observations

Those layers should preserve provenance instead of silently replacing static evidence.
