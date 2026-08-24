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
- OSCAL Assessment Results export.
- Future runtime corroboration via OpenTelemetry, eBPF and other evidence producers.

## GitHub direction

The open-source Action runs entirely inside the repository's GitHub runner and remains advisory by default.

Implemented PR ratchets:

- finding ratchet - old debt remains in summary, new stable finding fingerprints produce warnings;
- reachability ratchet - an existing mutation becoming statically reachable through a new route/job/hook can be surfaced without pretending that runtime execution was proven;
- topology ratchet - base/head Assurance Graphs expose new entrypoints, framework dispatches and entrypoint-to-mutation paths;
- alternate-path findings - a newly added route/job/hook can create `AS-AUTH-002`, `AS-AUDIT-002` or `AS-ATOMIC-002` even when the mutation source itself is unchanged.

Future modes may add explicit regression/enforcement policy, but policy must remain separate from the Core semantic contracts.

## Agent / MCP direction

Desired loop:

```text
inspect
  -> build/diff assurance graph
  -> query evidence
  -> explain
  -> plan remediation
  -> coding agent changes
  -> inspect
  -> verify
  -> map controls
  -> export evidence
```

AuditSpec MCP must not duplicate Inspector semantics and should keep source-writing authority separate from assessment authority in v0.1.

## Compliance direction

- AuditSpec does not certify SOC 2, ISO 27001, NIST or any other framework.
- Mappings express evidence relevance or potential gaps.
- OSCAL is the preferred machine-readable bridge for NIST-style assessment artifacts.
- OSCAL Assessment Results export must require caller-provided Assessment Plan context rather than inventing it.
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

## Runtime evidence direction

Runtime evidence is corroboration, not business-semantic truth. eBPF can prove process/syscall/network/file observations but cannot independently prove that a SQL write means `invoice.approve`. Future adapters can ingest Tetragon/Falco/OTel/osquery/Linux Audit/ETW evidence and correlate it with semantic events.

## Implemented Inspector hardening

- Rails and Frappe mutation discovery uses ast-grep/Tree-sitter call nodes instead of raw line regex, removing comment/string false positives.
- Calls are attached to owning Ruby method/Python function scopes, so unrelated audit calls in the same file do not cover a mutation.
- A conservative cross-file Assurance Graph resolves unambiguous calls and retains ambiguous calls as unresolved evidence.
- Framework-aware graph surfaces/dispatch currently cover explicit Rails routes, ActiveJob/Sidekiq dispatch, Frappe whitelist functions, `doc_events`, `scheduler_events`, and dotted `frappe.enqueue` targets.
- Stable boundary fingerprints permit line-independent base/head reachability comparison.
- Assurance Graph topology diff tracks new/removed entrypoints, framework dispatches and entrypoint-to-mutation paths by semantic identity rather than source line.
- Canonical all-path Inspector evaluates every resolved entrypoint path up to a bounded cap instead of trusting only the strongest path.
- Mixed-path gaps produce `AS-AUDIT-002`, `AS-ATOMIC-002`, and `AS-AUTH-002`.
- Path enumeration is capped at 64 paths / depth 8; truncation downgrades the boundary to `unknown/low` rather than creating optimistic coverage.
- Pinned public Rails and Frappe repositories are exercised by real-world Inspector smoke tests in CI.
- Synthetic PR tests cover new route exposure, graph topology change, and authorization bypass through an alternate route.
- Draft PR CI is the review/verification surface while v0.1 remains unmerged.

## Release hardening backlog

- Validate generated OSCAL 1.2.3 documents against the complete official NIST JSON Schema offline in conformance. Do not vendor a release schema until the source and checksum are verified.
- Expand Rails framework resolution for `resources`, nested/namespaced routes, callbacks, concerns, ActionCable and framework-generated dispatch.
- Expand Frappe framework resolution for dynamic hook composition, `frappe.enqueue(method=...)`, document controller hooks and additional worker surfaces.
- Add message-bus/RPC edges and runtime trace correlation without treating them as semantic truth.
- Add graph/path property tests and fuzzing around cycles, path explosion, ambiguity and stable semantic fingerprints.
- Expand invalid conformance corpus across every non-Core contract.
- Add differential conformance beyond TypeScript/Python schema validation.
- Add actual Apache-2.0 LICENSE before tag.
- Remove/promote this working notes file before the first release.
- Squash the v0.1 working history into a clean release commit.
