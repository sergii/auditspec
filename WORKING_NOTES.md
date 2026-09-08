# AuditSpec v0.1 Working Notes

> Temporary design backlog for the v0.1 working branch. Before the first release, useful material should be promoted into stable documentation and this file should be removed or reduced so the published history does not become a brainstorming transcript.

## Product direction

AuditSpec should evolve from an event schema into an executable assurance ecosystem while keeping the Core specification independently useful.

### Core ecosystem

- Semantic AuditSpec Core event contract.
- Profiles for agents, authorization, privacy, provenance and integrity.
- Shared conformance corpus across language implementations.
- Framework adapters and Inspector.
- CLI and MCP surfaces.
- Advisory GitHub Action / future GitHub App.
- Assessment reports, stable findings, confidence and evidence.
- Baseline/ratchet assessment diffs.
- Assurance Graph and topology diffs.
- Structured remediation plans and verification.
- Control mappings without compliance overclaiming.
- Evidence querying.
- NIST-schema-valid OSCAL Assessment Results export with explicit assessor context.
- Runtime corroboration with explicit producer trust, observation coverage, observation scope, provenance, query/diff semantics and static/runtime separation.
- Machine-readable framework and runtime-producer capability registries.

## GitHub direction

The open-source Action runs entirely inside the repository's GitHub runner and remains advisory by default.

Implemented PR ratchets:

- finding ratchet - old debt remains in summary, new stable finding fingerprints produce warnings;
- reachability ratchet - an existing mutation becoming statically reachable through a new route/job/hook can be surfaced without pretending that runtime execution was proven;
- topology ratchet - base/head Assurance Graphs expose new entrypoints, framework dispatches and entrypoint-to-mutation paths;
- alternate-path findings - a newly added route/job/hook can create `AS-AUTH-002`, `AS-AUDIT-002` or `AS-ATOMIC-002` even when the mutation source itself is unchanged.

Future modes may add explicit regression/enforcement policy, but policy must remain separate from the Core semantic contracts.

Potential runtime PR/continuous-assurance ratchets:

- new static path with no corresponding runtime evidence should remain informational unless observation scope is known to be relevant;
- static/runtime contradiction should be a separate signal, not a rewrite of the static finding;
- only `not_observed + exhaustive` may produce a non-observation contradiction;
- evidence freshness/observation-window expiry should prevent stale runtime observations from being treated as current corroboration;
- comparability-aware Corroboration Diffs may feed future regression policy, but `no_longer_reported` must never be treated as automatic remediation.

## Agent / MCP direction

Desired loop:

```text
list framework/runtime capabilities
  -> inspect
  -> build/diff assurance graph
  -> query static evidence
  -> ingest/corroborate runtime evidence
  -> query/diff runtime corroboration
  -> explain
  -> plan remediation
  -> coding agent changes
  -> inspect
  -> verify
  -> map controls
  -> export evidence / OSCAL
```

AuditSpec MCP must not duplicate Inspector semantics and should keep source-writing authority separate from assessment authority in v0.1.

## Compliance direction

- AuditSpec does not certify SOC 2, ISO 27001, NIST or any other framework.
- Mappings express evidence relevance or potential gaps.
- OSCAL is the preferred machine-readable bridge for NIST-style assessment artifacts.
- OSCAL Assessment Results export requires caller-provided Assessment Plan, reviewed-control scope and finding target/status context rather than inventing assessor conclusions.
- Generated OSCAL 1.2.3 is validated in CI against the complete official SHA-256-pinned NIST release JSON Schema.
- Add SOC 2 / ISO mappings only with careful control provenance and licensing review.

## Research / assurance direction

- W3C PROV mapping for actors, activities, entities and delegation.
- CloudEvents transport mapping.
- OpenTelemetry trace/log mapping.
- RFC 8785/JCS + signatures / SCITT integrity profile later.
- Evidence Graph with multiple independent producers and explicit trust.
- Property-based, fuzz, mutation and failure-injection tests.
- Differential conformance across TypeScript/Ruby/Python/Go/Rust.
- Reference corpus from real audit ecosystems with information-loss reports.
- Competency questions and formal/TLA+ pipeline model later.
- Formalize graph/path invariants: unresolved edges never strengthen assurance, path enumeration truncation never strengthens coverage, alternate weaker paths cannot be hidden by a stronger path.
- Formalize corroboration invariants: bounded non-observation is inconclusive, producer trust never broadens authority scope, and runtime evidence never mutates static coverage.

## Runtime evidence direction

Implemented L4 foundation:

- `RuntimeEvidenceRecord` schema;
- `ObservationScope` schema with declared/partial/unknown basis;
- `CorroborationReport` schema;
- `CorroborationDiff` schema and comparability semantics;
- `CorroborationQueryResult` schema with preserved source observation scope and provenance;
- `observed -> supports`;
- `contradicted -> contradicts`;
- `not_observed + exhaustive -> contradicts`;
- bounded non-observation -> `inconclusive`;
- CLI `corroborate`, `diff-corroboration` and `query-corroboration`;
- MCP `auditspec.corroborate_runtime`, `auditspec.diff_runtime_corroboration`, `auditspec.query_runtime_corroboration` and producer registry tools;
- TypeScript/Python/Ruby schema conformance;
- reference OpenTelemetry producer with explicit target fingerprints;
- reference authorization-decision producer with narrow decision authority semantics;
- reference database receipt producer for transaction/audit/outbox persistence;
- reference delivery receipt producer;
- machine-readable runtime producer manifests with separate CI validation;
- producer-to-corroboration integration tests;
- observation-scope comparability across environment, observation-window duration, collection policy and producer set.

Runtime evidence is corroboration, not business-semantic truth. eBPF can prove process/syscall/network/file observations but cannot independently prove that a SQL write means `invoice.approve`.

Next runtime producer candidates:

- reverse-proxy/request receipt producer;
- Linux Audit / osquery / ETW adapters;
- Tetragon/Falco/eBPF producer for kernel-visible facts;
- signed/attested runtime receipts, potentially using JCS/signatures and later SCITT-style transparency/receipts.

Runtime hardening backlog:

- define evidence freshness/expiry semantics on top of the current explicit observation scope;
- define whether an evidence record may supersede/revoke a prior record without destroying append-only history;
- add integrity/signature fields or a separate signed evidence envelope;
- define explicit producer authority scopes as policy inputs, not only documentation/manifests;
- promote comparability-aware Corroboration Diff into explicit PR/continuous-assurance ratchet policy without conflating it with static Assessment Diff;
- add multi-producer corroboration rules without naive majority voting;
- add temporal graph/history views for evidence freshness and contradiction resolution;
- preserve trace/request/session/tool-call correlation but never create semantic graph edges from correlation coincidence alone.

## eBPF boundary

Potential eBPF/Tetragon/Falco evidence can corroborate kernel-visible facts such as:

- process execution;
- network connect/accept;
- file access/write;
- selected syscall behavior;
- container/process identity where reliably observed.

It cannot by itself establish:

- business intent;
- human/agent accountability;
- application authorization policy semantics;
- correctness of a semantic AuditSpec action name;
- that a SQL statement represents a specific business operation.

Therefore eBPF remains an evidence producer beneath semantic application auditing, not a replacement for it.

## Implemented Inspector hardening

- Rails and Frappe mutation discovery uses ast-grep/Tree-sitter call nodes instead of raw line regex, removing comment/string false positives.
- Ruby AST discovery additionally handles conservative standalone zero-argument sends when Tree-sitter exposes an ambiguous bare command as an identifier; parameter/local bindings and non-standalone identifier uses remain excluded.
- Calls are attached to owning Ruby method/Python function scopes, so unrelated audit calls in the same file do not cover a mutation.
- A conservative cross-file Assurance Graph resolves unambiguous calls and retains ambiguous calls as unresolved evidence.
- Framework-aware graph surfaces/dispatch currently cover context-aware explicit Rails routes; conservative literal Rails `resources`/`resource` routes with namespace, nesting and supported `scope` composition; literal static constraint metadata; ActiveJob/Sidekiq dispatch; direct and composed ActionCable RPC plus channel/connection lifecycle dispatch; deterministically attributed Frappe whitelist functions, typed literal `doc_events`/`scheduler_events`; literal dotted, conservative same-module function-reference and direct exact-scope absolute-import `frappe.enqueue` positional/`method=` targets; conservative `frappe.enqueue_doc` controller-method dispatch; conservative `Document.queue_action` background surfaces; and conservative DocType `Document` controller lifecycle hooks.
- Frappe whitelist attribution is owned by the exact Python `decorated_definition` AST node. Direct, stacked and multiline `@frappe.whitelist(...)` forms are supported; neighboring decorators cannot strengthen another function, while aliased decorator names remain fail-closed until import/name resolution proves their identity.
- Frappe hook parsing follows the literal `doc_events` and `scheduler_events` structure and documented event vocabularies. Dynamic composition, reassignment, duplicate keys, unknown event names and unrelated dotted strings fail closed.
- Frappe enqueue resolution interprets the exact `frappe.enqueue(...)` call semantically: literal `method=` wins over unrelated dotted keyword strings, unshadowed top-level function references in the same module are resolved in positional or `method=` form, and direct exact-scope absolute `from ... import ...` function references including `as` aliases resolve through AST-owned bindings. Conditional/relative/wildcard/duplicate/late imports, rebinding, module-level imported function refs, attribute refs, starred composition, dynamic expressions and unrelated `.enqueue` methods fail closed.
- Frappe `enqueue_doc` resolution requires literal DocType and method identity but permits a dynamic document name because instance identity does not change the code target. It resolves only a unique conventional direct `Document` controller method; dynamic target identity, ambiguous controllers and custom/indirect controller wiring fail closed.
- Frappe `Document.queue_action` resolution requires an AST-proven `self.queue_action(...)` call in a conventional direct `Document` controller with a literal action identity. It mirrors app-local `_<action>` precedence and keeps the queued execution as a separate entrypoint surface so caller assurance does not automatically cross the async boundary.
- Frappe DocType lifecycle projection requires the conventional `.../doctype/<name>/<name>.py` path, exactly one explicit direct `Document` controller, and a documented lifecycle method. The framework surface remains the entrypoint and targets the concrete controller method; storage primitives such as `db_insert`/`db_update` are not promoted to lifecycle entrypoints.
- Literal Rails `scope` supports a positional path plus literal `path`, `module`, and `as` options. Scope context is shared by resource expansion and explicit routes so scoped dispatch is not duplicated as an optimistic root route.
- Literal `constraints ... do` blocks with simple scalar values are preserved in route-surface identity but never treated as authorization or proof of unreachability. Dynamic/complex constraints fail closed.
- Routed Rails controller actions can inherit the `authorization` assurance role from literal `before_action` callbacks when the callback method contains authorization semantics recognized by the deterministic Ruby adapter.
- Callback authorization projection supports same-controller callbacks, unambiguous non-namespaced literal superclass chains, and explicit fully-qualified namespaced superclass chains, with literal `only`/`except` filtering.
- Canonical `ActiveSupport::Concern` callback projection supports literal `include SomeConcern` and explicit qualified `include Admin::SomeConcern`, a unique matching concern module, a single literal `included do ... end` block, and callback methods defined by that concern.
- Conditional or dynamic callbacks, dynamic concern inclusion, ambiguous sources, skipped callbacks, and namespace semantics requiring lexical Ruby constant lookup fail closed rather than strengthening assurance.
- ActionCable projection covers direct public methods on explicit channel classes plus direct `subscribed`/`unsubscribed` lifecycle callbacks.
- ActionCable RPC projection follows unambiguous bounded superclass chains and exposes public inherited methods under the concrete child-channel surface while targeting the actual implementation node. Explicit fully-qualified namespaced superclass chains are supported; lexical constant lookup fails closed.
- Direct literal `ActiveSupport::Concern` includes can provide public ActionCable RPC methods when the concern resolves uniquely. Non-public concern methods, concern dependencies, dynamic composition and ambiguous same-name concern overlap do not produce optimistic RPC surfaces.
- ActionCable `subscribed`/`unsubscribed` lifecycle projection now follows the same proven superclass chain and direct concern composition. Lifecycle methods may be public, protected or private because they are framework-dispatched rather than client RPC surfaces.
- Child method definitions shadow inherited ActionCable methods regardless of visibility. Ambiguous same-name concern overlap fails closed for both RPC and lifecycle dispatch.
- The conventional `ApplicationCable::Connection < ActionCable::Connection::Base` `connect`/`disconnect` lifecycle is modeled as separate entrypoint surfaces, including the standard lexical `module ApplicationCable; class Connection ...` form. Custom connection-class wiring and indirect connection inheritance fail closed.
- `reject_unauthorized_connection` is recognized as connection-local authorization evidence, including its common zero-argument command form.
- ActionCable connection/subscription authorization is kept separate from later RPC action assurance; `connect` or `subscribed` authorization does not automatically strengthen every action path.
- Stable boundary fingerprints permit line-independent base/head reachability comparison.
- Assurance Graph topology diff tracks new/removed entrypoints, framework dispatches and entrypoint-to-mutation paths by semantic identity rather than source line.
- Canonical all-path Inspector evaluates every resolved entrypoint path up to a bounded cap instead of trusting only the strongest path.
- Mixed-path gaps produce `AS-AUDIT-002`, `AS-ATOMIC-002`, and `AS-AUTH-002`.
- Path enumeration is capped at 64 paths / depth 8; truncation downgrades the boundary to `unknown/low` rather than creating optimistic coverage.
- Pinned public Rails and Frappe repositories are exercised by real-world Inspector smoke tests in CI.
- Synthetic PR tests cover new route exposure, graph topology change, authorization bypass through an alternate route, namespaced/nested/scoped resource dispatch, context-aware scoped explicit routes, static constraint identity, local/inherited/concern-derived/explicit-namespaced callback authorization, ActionCable direct/channel lifecycle dispatch, conventional connection lifecycle, inherited and concern-provided RPC actions, inherited and concern-provided `subscribed`/`unsubscribed` lifecycle callbacks including non-public lifecycle methods, non-public override behavior, ambiguous concern overlap, namespaced channel inheritance, conservative zero-argument Ruby sends, connection/subscription auth separation, deterministic Frappe whitelist attribution including multiline decorators, typed static hook parsing, Frappe enqueue dotted, same-module and direct imported function-reference target resolution with fail-closed shadowing, `frappe.enqueue_doc` conventional controller resolution/fail-closed ambiguity, `Document.queue_action` async surfaces, and DocType lifecycle surface-to-mutation reachability.
- Draft PR CI is the review/verification surface while v0.1 remains unmerged.

## Release hardening status

Completed:

- added the Apache License 2.0 `LICENSE` file and aligned README licensing.
- synchronized the runtime working backlog with implemented observation scope, query/diff, comparability and authorization-producer capabilities.
- added conservative Rails `resources`/`resource` resolution with literal `only`, `except`, `path`, `param` and `controller` options.
- added literal `namespace` and nested resource composition, with dynamic/unsupported routing constructs failing closed rather than producing guessed framework edges.
- added contextual literal Rails `scope` composition for resources and explicit routes, plus canonical metadata for simple literal constraint blocks; dynamic scopes/constraints remain fail-closed.
- added conservative Rails `before_action` authorization projection with literal `only`/`except` filtering, same-controller support and unambiguous superclass traversal.
- added conservative `ActiveSupport::Concern` callback authorization projection for literal concern inclusion and concern-defined authorization callback methods.
- added explicit fully-qualified namespaced controller inheritance and concern identities while keeping lexical namespace lookup fail closed.
- added conservative ActionCable Assurance Graph surfaces for direct public channel RPC actions and direct `subscribed`/`unsubscribed` lifecycle callbacks, including explicit fully-qualified namespaced channel classes.
- added conventional `ApplicationCable::Connection` `connect`/`disconnect` lifecycle surfaces while keeping connection authorization separate from later channel actions.
- added unambiguous inherited and direct `ActiveSupport::Concern`-provided ActionCable RPC resolution, explicit fully-qualified namespaced channel inheritance, override/visibility handling, and connection-local `reject_unauthorized_connection` evidence.
- added inherited and direct `ActiveSupport::Concern`-provided ActionCable `subscribed`/`unsubscribed` lifecycle resolution with framework visibility semantics and ambiguity-safe shadowing.
- hardened Frappe whitelist attribution so only the exact decorated function receives an entrypoint role; stacked and multiline decorators are attributed through the owned Python AST node and neighboring source text cannot leak whitelist semantics.
- replaced broad Frappe hook string scanning with typed literal `doc_events`/`scheduler_events` parsing and documented event vocabularies.
- hardened exact `frappe.enqueue(...)` dispatch so literal dotted positional targets and literal dotted `method=` targets resolve deterministically without confusing queue/job metadata for callable identity.
- added conservative same-module `frappe.enqueue(function_ref)` and `frappe.enqueue(method=function_ref)` resolution for unshadowed top-level functions, with rebinding/import/attribute cases failing closed.
- added AST-owned exact-scope import binding discovery and conservative direct absolute `from ... import ...` enqueue resolution, including aliases, import-before-call checks and no fallback to a same-name local function when the imported target is unresolved.
- added conservative Frappe DocType controller lifecycle surfaces for documented direct `Document` hooks on conventional controller paths, including graph-level reachability tests from lifecycle entrypoint to mutation.
- added conservative `frappe.enqueue_doc(...)` dispatch to a unique conventional direct `Document` controller method, with literal DocType/method identity, dynamic document-instance names, and ambiguity-safe failure semantics.
- added conservative `Document.queue_action(...)` background surfaces for literal self-dispatch inside conventional direct controllers, with app-local inner-method precedence and async assurance separation.

Remaining release backlog:

- Expand Rails framework resolution for lexical/nested concern composition, custom ActionCable connection wiring, complex/callable route constraints, additional route DSL variants and additional framework-generated dispatch.
- Expand Frappe framework resolution for aliased whitelist decorators, module-level imported enqueue function references, `import module`/attribute-reference enqueue targets, relative imports that can be resolved from repository/package context, custom or indirect DocType controller resolution and other dynamic composition that can be proven without optimistic inference.
- Add full pinned Frappe Bench behavioral runtime lab before claiming L2 framework-runtime proof.
- Add message-bus/RPC edges and runtime trace correlation without treating them as semantic truth.
- Review every current `future`/`planned` statement in README/docs against implementation before release.
- Remove/promote this working notes file before the first release.
- Squash the v0.1 working history into a clean release commit.
