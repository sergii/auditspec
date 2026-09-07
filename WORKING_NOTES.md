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
- Calls are attached to owning Ruby method/Python function scopes, so unrelated audit calls in the same file do not cover a mutation.
- A conservative cross-file Assurance Graph resolves unambiguous calls and retains ambiguous calls as unresolved evidence.
- Framework-aware graph surfaces/dispatch currently cover explicit Rails routes, conservative literal Rails `resources`/`resource` routes including supported namespace and nested-resource composition, ActiveJob/Sidekiq dispatch, Frappe whitelist functions, `doc_events`, `scheduler_events`, and dotted `frappe.enqueue` targets.
- Routed Rails controller actions can inherit the `authorization` assurance role from literal `before_action` callbacks when the callback method contains authorization semantics recognized by the deterministic Ruby adapter.
- Callback authorization projection supports same-controller callbacks plus unambiguous non-namespaced literal superclass chains, with literal `only`/`except` filtering.
- Canonical `ActiveSupport::Concern` callback projection supports literal `include SomeConcern`, a unique non-namespaced concern module, a single literal `included do ... end` block, and callback methods defined by that concern.
- Conditional or dynamic callbacks, dynamic/namespaced concern inclusion, namespaced inheritance, ambiguous sources, and skipped callbacks fail closed rather than strengthening assurance.
- Stable boundary fingerprints permit line-independent base/head reachability comparison.
- Assurance Graph topology diff tracks new/removed entrypoints, framework dispatches and entrypoint-to-mutation paths by semantic identity rather than source line.
- Canonical all-path Inspector evaluates every resolved entrypoint path up to a bounded cap instead of trusting only the strongest path.
- Mixed-path gaps produce `AS-AUDIT-002`, `AS-ATOMIC-002`, and `AS-AUTH-002`.
- Path enumeration is capped at 64 paths / depth 8; truncation downgrades the boundary to `unknown/low` rather than creating optimistic coverage.
- Pinned public Rails and Frappe repositories are exercised by real-world Inspector smoke tests in CI.
- Synthetic PR tests cover new route exposure, graph topology change, authorization bypass through an alternate route, namespaced/nested resource dispatch, and local/inherited/concern-derived callback authorization.
- Draft PR CI is the review/verification surface while v0.1 remains unmerged.

## Release hardening status

Completed:

- added the Apache License 2.0 `LICENSE` file and aligned README licensing.
- synchronized the runtime working backlog with implemented observation scope, query/diff, comparability and authorization-producer capabilities.
- added conservative Rails `resources`/`resource` resolution with literal `only`, `except`, `path`, `param` and `controller` options.
- added literal `namespace` and nested resource composition, with dynamic/unsupported routing constructs failing closed rather than producing guessed framework edges.
- added conservative Rails `before_action` authorization projection with literal `only`/`except` filtering, same-controller support and unambiguous non-namespaced superclass traversal.
- added conservative `ActiveSupport::Concern` callback authorization projection for literal concern inclusion and concern-defined authorization callback methods.

Remaining release backlog:

- Expand Rails framework resolution for namespaced callback inheritance, nested/namespaced concern composition, ActionCable, supported `scope` variants, constraints and additional framework-generated dispatch.
- Expand Frappe framework resolution for dynamic hook composition, `frappe.enqueue(method=...)`, document controller hooks and additional worker surfaces.
- Add full pinned Frappe Bench behavioral runtime lab before claiming L2 framework-runtime proof.
- Add message-bus/RPC edges and runtime trace correlation without treating them as semantic truth.
- Review every current `future`/`planned` statement in README/docs against implementation before release.
- Remove/promote this working notes file before the first release.
- Squash the v0.1 working history into a clean release commit.
