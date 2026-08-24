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
- Structured remediation plans and verification.
- Control mappings without compliance overclaiming.
- Evidence querying and Assurance Graph projections.
- OSCAL Assessment Results export.
- Future runtime corroboration via OpenTelemetry, eBPF and other evidence producers.

## GitHub direction

The open-source Action should run entirely inside the repository's GitHub runner. Default mode is advisory. Inline annotations should focus on new findings introduced by the PR while old debt remains in summary. Future modes may be regression/enforcement opt-ins.

## Agent / MCP direction

Desired loop:

```text
inspect -> query evidence -> explain -> plan remediation -> coding agent changes -> inspect -> verify -> map controls -> export evidence
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

## Runtime evidence direction

Runtime evidence is corroboration, not business-semantic truth. eBPF can prove process/syscall/network/file observations but cannot independently prove that a SQL write means `invoice.approve`. Future adapters can ingest Tetragon/Falco/OTel/osquery/Linux Audit/ETW evidence and correlate it with semantic events.

## Implemented Inspector hardening

- Rails and Frappe mutation discovery uses ast-grep/Tree-sitter call nodes instead of raw line regex, removing comment/string false positives.
- Calls are attached to owning Ruby method/Python function scopes, so unrelated audit calls in the same file do not cover a mutation.
- A conservative cross-file Assurance Graph resolves unambiguous calls and retains ambiguous calls as unresolved evidence.
- Inspector coverage/findings are reconciled through Assurance Graph paths rather than repository-wide presence checks.
- Framework-aware graph surfaces/dispatch currently cover explicit Rails routes, ActiveJob/Sidekiq job dispatch, Frappe whitelist functions, `doc_events`, `scheduler_events`, and dotted `frappe.enqueue` targets.
- Pinned public Rails and Frappe repositories are exercised by real-world Inspector smoke tests in CI.
- Draft PR CI is the review/verification surface while v0.1 remains unmerged.

## Release hardening backlog

- Validate generated OSCAL 1.2.3 documents against the complete official NIST JSON Schema offline in conformance. Do not vendor a release schema until the source and checksum are verified.
- Expand Rails framework resolution for `resources`, nested/namespaced routes, callbacks, concerns, ActionCable and framework-generated dispatch.
- Expand Frappe framework resolution for dynamic hook composition, `frappe.enqueue(method=...)`, document controller hooks and additional worker surfaces.
- Add message-bus/RPC edges and runtime trace correlation without treating them as semantic truth.
- Expand invalid conformance corpus across every non-Core contract.
- Add property-based/fuzz/mutation/failure-injection testing for schema and Inspector invariants.
- Add actual Apache-2.0 LICENSE before tag.
- Remove/promote this working notes file before the first release.
- Squash the v0.1 working history into a clean release commit.
