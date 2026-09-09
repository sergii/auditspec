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
- framework provenance - the route, hook, scheduler, queue, channel, callback, or other declaration/call that created a framework edge.

The canonical example is `schema/examples/assurance-graph.json`.

## Framework-aware surfaces

The reference implementation currently adds deterministic or deliberately bounded framework evidence for the following supported subsets.

### Rails

Routing and HTTP dispatch:

- explicit `get/post/put/patch/delete` routes with literal controller/action targets, including supported `scope` and `constraints` context;
- literal `resources` and singular `resource` expansion;
- literal `only`, `except`, `path`, `param`, and `controller` resource options;
- literal `namespace`, nested resources, and literal `scope` composition using positional path plus supported `path`, `module`, and `as` options;
- simple literal scalar `constraints ... do` metadata preserved in route-surface identity without treating constraints as authorization or proof of unreachability;
- controller actions as conservative fallback entrypoints when no explicit route edge can be resolved.

Authorization projection:

- literal `before_action` authorization callbacks with supported `only`/`except` filtering;
- same-controller callbacks plus unambiguous literal superclass chains;
- explicit fully-qualified namespaced superclass chains;
- direct uniquely resolved `ActiveSupport::Concern` callback composition, including explicit fully-qualified concern identities.

Background dispatch:

- `ApplicationJob` / `ActiveJob::Base` `perform` methods;
- Sidekiq `Job` / `Worker` `perform` methods;
- `perform_later`, `perform_now`, `perform_async`, `perform_in`, and `perform_at` when the receiver uniquely identifies a job/worker.

ActionCable:

- direct public channel RPC actions;
- unambiguous inherited public RPC actions;
- direct uniquely resolved `ActiveSupport::Concern`-provided public RPC actions;
- direct/inherited/concern-provided `subscribed` and `unsubscribed` lifecycle callbacks, including non-public lifecycle visibility;
- conventional `ApplicationCable::Connection` `connect` / `disconnect` lifecycle surfaces, including the standard lexical Rails declaration;
- connection-local `reject_unauthorized_connection` authorization evidence.

Connection or subscription authorization is intentionally not projected onto every later channel RPC action.

### Frappe

RPC/hooks:

- exact AST-owned `@frappe.whitelist` function attribution, including stacked and multiline decorators;
- v0.2 module-level `frappe.whitelist` import aliases when direct import identity and alias stability before the decorated definition can be proven conservatively;
- literal typed `doc_events` handlers using documented event names;
- literal typed `scheduler_events`, including literal nested `cron` handler maps.

Background dispatch:

- literal dotted `frappe.enqueue(...)` positional and `method=` targets;
- unshadowed same-module top-level function references passed to `frappe.enqueue`;
- direct exact-scope absolute `from ... import ...` function references, including aliases, when the import and repository target can be proven;
- v0.2 direct module-level absolute `from ... import ...` function references, including aliases, when the binding precedes the caller, remains unrebound, is not caller-shadowed, and resolves to a repository target;
- `frappe.enqueue_doc(...)` with literal DocType/method identity resolving to a unique conventional direct `Document` controller method;
- `Document.queue_action(...)` for literal self-dispatch inside a conventional direct controller, preserving Frappe's app-local `_<action>` precedence and the asynchronous assurance boundary.

Document lifecycle:

- documented `Document` controller lifecycle methods on conventional `.../doctype/<name>/<name>.py` paths when exactly one direct `Document` controller can be proven.

Framework dispatch is static evidence, not runtime proof. AuditSpec records the declaration/call location and confidence instead of silently treating framework conventions as certainty.

## Conservative resolution

AuditSpec MUST prefer an unresolved call over a speculative edge.

The reference implementation resolves a direct source call when either:

1. its receiver identifies exactly one matching container/method candidate, or
2. only one repository-wide method/function candidate exists, in which case the edge is lower confidence.

Framework-specific edges have stricter resolvers. Unsupported dynamic composition, ambiguous controller/channel/concern identity, Ruby lexical constant lookup outside the explicitly modeled cases, and Python import/name semantics that cannot be proven remain fail-closed.

If multiple candidates remain, the relationship MUST NOT strengthen audit coverage.

This is intentional. Ruby metaprogramming, Python dynamic dispatch, dependency injection, generated methods, RPC, queues, and runtime routing can make static resolution incomplete.

## Assurance paths

`findAssurancePath` starts from a repository-relative source location and walks resolved incoming calls/dispatches toward an entrypoint or the edge of the known graph. It reports the roles observed on the selected path and a confidence level.

A path with `audit` evidence may remove an `AS-AUDIT-001` gap for the corresponding mutation. A Rails path with both `audit` and `transaction` may support `covered` status. Authorization evidence can resolve `AS-AUTH-001` when it is on the same resolved path.

The canonical Inspector also evaluates all resolved entrypoint paths for a mutation rather than trusting only the strongest path. Alternate weaker paths can therefore produce `AS-AUDIT-002`, `AS-ATOMIC-002`, or `AS-AUTH-002`.

Path enumeration is bounded to 64 paths and depth 8. Truncation is explicit incompleteness and degrades the canonical boundary result to `unknown` / low confidence instead of optimistic coverage.

The graph does not claim that a path executed at runtime. It is static-source evidence only.

## Topology diff

`schema/assurance-graph-diff.schema.json` defines a separate graph-topology diff artifact. It exists because architecture can change even when findings do not.

The v0.1 topology diff compares stable semantic graph identities rather than line numbers and reports:

- `new_entrypoints` / `removed_entrypoints`;
- `new_framework_dispatches` / `removed_framework_dispatches`;
- `new_mutation_paths` / `removed_mutation_paths`;
- `unchanged_mutation_paths` and summary counts.

A mutation-path fingerprint represents a resolved entrypoint-to-mutation relationship. For example, adding a Rails route to an existing controller/service chain can create a new mutation path even when the mutation source itself is unchanged and no new source-local finding appears.

Topology diff is deliberately separate from Assessment Diff. Assessment Diff answers whether findings, audit coverage, and known boundary reachability changed. Assurance Graph Diff answers whether the resolved architecture itself changed.

Neither artifact proves runtime execution.

## CLI

```bash
auditspec graph .
auditspec graph-diff ./base-worktree ./head-worktree
auditspec assurance-path . app/services/approve_invoice.rb 12 5
```

These commands return JSON so their output can be stored, diffed, visualized, or consumed by agents.

## MCP

The reference MCP server exposes:

- `auditspec.build_assurance_graph`
- `auditspec.diff_assurance_graphs`
- `auditspec.find_assurance_path`

This lets an agent inspect a repository, compare architecture before/after a change, ask for the evidence path behind a finding, propose remediation, re-inspect, and verify whether the relevant path changed.

## Static/runtime evidence boundary

The Assurance Graph is not runtime proof, formal verification, or a complete program call graph. It is deliberately bounded static evidence.

Runtime Corroboration is implemented as a separate evidence layer with explicit Observation Scope, provenance, trust, query/diff semantics, and reference OpenTelemetry, authorization-decision, database-receipt, and delivery-receipt producers. Runtime evidence can support, contradict, or remain inconclusive about stable static targets without rewriting the Assurance Graph or static Assessment coverage.

Remaining graph/framework work includes:

- Rails lexical/nested concern composition, custom ActionCable connection wiring, more complex/callable route constraints, additional route DSL variants, and additional framework-generated dispatch;
- Frappe module/attribute enqueue targets, resolvable relative imports, custom/indirect DocType controllers, and other dynamic composition that can be proven without optimistic inference;
- message-bus and cross-service RPC edges;
- evidence-backed trace/request/session/tool-call correlation that never invents semantic graph edges from correlation coincidence.

Future runtime producers may add reverse-proxy, OS-audit, eBPF/kernel, or signed/attested receipts. Those layers must preserve provenance and authority boundaries instead of silently replacing static evidence.
