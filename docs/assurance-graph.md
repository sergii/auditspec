# Assurance Graph

AuditSpec Assurance Graph is a machine-readable static evidence graph for reasoning about whether a discovered mutation is connected to authorization, transaction, audit, application entrypoints, and framework dispatch surfaces.

It is an Inspector artifact, not part of the Core Audit Event envelope.

## Why it exists

File-level source scanning is too coarse for meaningful assurance. An audit call in another method of the same file must not make an unrelated mutation look covered, while a controller delegating to a service in another file should be able to contribute relevant evidence when that call can be resolved safely.

The graph models method/function scopes, framework surfaces, conservative call edges, and framework dispatch edges so tools can reason about paths such as:

```text
HTTP route
  -> controller action
  -> authorization
  -> service
  -> transaction
  -> mutation
  -> AuditSpec emission
```

and asynchronous paths such as:

```text
service
  -> ActiveJob / Sidekiq dispatch
  -> perform
  -> mutation
  -> AuditSpec emission
```

## Contract

The canonical schema is `schema/assurance-graph.schema.json`.

A graph contains:

- `nodes` - Ruby method/Python function scopes plus explicit framework surface nodes.
- `edges` - statically resolved `call` and `framework_dispatch` relationships.
- `unresolved_calls` - ambiguous calls that AuditSpec deliberately refuses to guess.
- `roles` - `entrypoint`, `authorization`, `transaction`, `mutation`, and `audit` evidence.
- `confidence` - confidence in the static evidence represented by the graph.
- framework provenance - the route, hook, scheduler, or queue declaration that created a framework edge.

The canonical example is `schema/examples/assurance-graph.json`.

## Framework-aware surfaces in v0.1

The reference implementation currently adds deterministic framework evidence for:

### Rails

- explicit routes using `get/post/put/patch/delete ... to: "controller#action"` or hash-rocket syntax;
- controller actions as fallback entrypoints when no explicit route edge can be resolved;
- `ApplicationJob` / `ActiveJob::Base` `perform` methods;
- Sidekiq `Job` / `Worker` `perform` methods;
- `perform_later`, `perform_now`, `perform_async`, `perform_in`, and `perform_at` dispatch when the receiver uniquely identifies a job/worker.

### Frappe

- `@frappe.whitelist` functions;
- `hooks.py` `doc_events` handlers;
- `hooks.py` `scheduler_events` handlers;
- `frappe.enqueue("dotted.module.function")` when the dotted target uniquely resolves to repository source.

Framework dispatch is evidence, not runtime proof. AuditSpec records the declaration/call location and confidence instead of silently treating framework conventions as certainty.

## Conservative resolution

AuditSpec MUST prefer an unresolved call over a speculative edge.

The v0.1 reference implementation resolves a direct source call when either:

1. its receiver identifies exactly one matching container/method candidate, or
2. only one repository-wide method/function candidate exists, in which case the edge is lower confidence.

Framework-specific edges have their own stricter resolvers. For example, a Rails job receiver must uniquely identify a `perform` scope, while a Frappe dotted target must map to one source module and function.

If multiple candidates remain, the relationship MUST NOT strengthen audit coverage.

This is intentional. Ruby metaprogramming, Python dynamic dispatch, dependency injection, generated methods, RPC, queues, and runtime routing can make static resolution incomplete.

## Assurance paths

`findAssurancePath` starts from a repository-relative source location and walks resolved incoming calls/dispatches toward an entrypoint or the edge of the known graph. It reports the roles observed on the selected path and a confidence level.

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

- richer Rails route/resource/callback resolution;
- richer Frappe dynamic hook and enqueue resolution;
- message-bus and RPC edges;
- OpenTelemetry trace correlation;
- runtime instrumentation;
- kernel/eBPF observations.

Those layers should preserve provenance instead of silently replacing static evidence.
