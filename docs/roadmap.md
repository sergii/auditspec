# AuditSpec roadmap

This document is a non-normative work queue for AuditSpec. It does not change the v0.1 contracts, schemas, conformance corpus, adapter manifests, or assurance semantics.

Current behavior is documented by the specification, schemas, framework/runtime manifests, reference implementations, and focused documents under `docs/`. Items below are directions and candidates until they are implemented, tested, and reflected in those executable surfaces.

## v0.2 development candidates

### Deeper Rails framework resolution

Current conservative Rails support should be extended only where static identity can be proven without optimistic inference. Candidate gaps include:

- lexical/nested concern composition;
- custom ActionCable connection wiring;
- complex or callable route constraints;
- additional route DSL variants;
- additional framework-generated dispatch surfaces.

Unsupported or ambiguous constructs should continue to fail toward unresolved/unknown evidence rather than stronger assurance.

### Deeper Frappe / ERPNext framework resolution

Candidate gaps include:

- `import module` / attribute-reference enqueue targets;
- relative imports resolvable from repository/package context;
- custom or indirect DocType controller resolution;
- other dynamic composition only when the target can be established conservatively.

The v0.2 development line already resolves Frappe whitelist decorator aliases when a direct module-level import proves that the decorator is `frappe.whitelist` and the alias remains unambiguous until the decorated definition. It also resolves direct absolute module-level `from module import function [as alias]` references passed to `frappe.enqueue(...)` when the binding is unique, precedes the caller, is not shadowed by caller-local state, remains unrebound at module level, and resolves to a concrete repository target.

### Cross-service topology

Add message-bus and RPC edges plus runtime trace correlation without treating correlation as semantic truth.

A trace/request/session/tool-call identifier may support correlation, but coincidence of identifiers must not create a semantic call edge, authorization edge, or business-action assertion by itself.

## Runtime assurance

The current runtime corroboration model already separates static findings from runtime evidence, preserves observation scope, supports query/diff semantics, and exposes reference producers. Further hardening candidates include:

- evidence freshness and expiry semantics;
- append-only supersede/revoke semantics without erasing prior observations;
- integrity/signature fields or a separate signed evidence envelope;
- explicit producer authority scopes as policy inputs, not only descriptive manifest metadata;
- comparability-aware runtime PR/continuous-assurance ratchets kept separate from static Assessment Diff;
- multi-producer corroboration rules without naive majority voting;
- temporal/history views for freshness and contradiction evolution.

A contradiction that disappears from a later observation window must not be called resolved unless the available evidence actually supports that conclusion.

## Additional runtime producers

Potential producers include:

- reverse-proxy or request receipts;
- Linux Audit, osquery, or ETW adapters;
- Tetragon, Falco, or other eBPF-based producers for kernel-visible facts;
- signed or attested runtime receipts.

Kernel-visible evidence can corroborate process, network, file, syscall, and container facts. It cannot independently prove business intent, application authorization semantics, human/agent accountability, or that a SQL statement represents a particular AuditSpec action.

## GitHub and continuous assurance

The open-source GitHub Action is advisory by default. Future work may include:

- explicit opt-in regression/enforcement policy;
- runtime-aware PR ratchets that respect observation scope and comparability;
- a GitHub App or optional continuous-assurance service.

Policy must remain separate from the Core event contract and from the meaning of Inspector findings.

## Integrity and provenance

Potential integrity/transparency work includes:

- RFC 8785/JCS-compatible canonicalization for signing use cases;
- signatures and signed evidence envelopes;
- SCITT-style transparency/receipt integration;
- PROV-O / JSON-LD serialization for the existing W3C PROV mapping;
- stronger evidence provenance across independently operated producers.

The current deterministic normalization helper is not a signing format and must not be retroactively treated as one.

## Conformance and research

Further hardening can include:

- a machine-readable OAuth 2.0 Token Exchange (RFC 8693) mapping/profile for `sub`, `act`, nested actor history, `may_act`, `scope`, and audience/resource semantics, with explicit tests that authorized-to-act is not confused with observed action;
- an HTTP request-evidence profile that can consume RFC 9421/Web Bot Auth/DPoP verification results without claiming that request-signature validity alone proves user identity, delegation, authorization, consent, or execution semantics;

The v0.2 TypeScript reference now includes the first executable RFC 9421 and RFC 9449 DPoP request-evidence projections with negative invariants around actor identity, delegation, authorization, consent, and execution. Web Bot Auth identity/key-discovery mapping remains future work.
- comparative research fixtures for OAuth Identity Chaining, Transaction Tokens, Transaction Tokens For Agents, and emerging human-mandate work, with explicit information-loss reports against the AuditSpec actor/delegation/authorization/evidence model;

The v0.2 line now includes executable information-loss fixtures for OAuth Identity Chaining v17, Transaction Tokens v11, and Transaction Tokens For Agents v02. The fixtures require an explicit disposition for every modeled source fact and execute the agent-chain attenuation scenario.

The v0.2 TypeScript reference also includes a transport-neutral human-mandate research evaluator based on the requirements in draft-yossif-agent-mandate-problem-00. It separates hard constraints from escalation boundaries, fails unverifiable action/mandate bindings closed, and records explicit coverage gaps for cryptographic binding, independently verifiable evidence, canonical payload binding, and fresh human-authorization interaction.

The v0.2 line now also includes a signed human-mandate proof using RFC 8785 canonicalization, SHA-256 content bindings, and Ed25519 signatures. A verifier can independently validate the proof issuer's signature, exact mandate/action digests, and deterministic evaluation consistency. The remaining cryptographic gap is independent replay of the original human mandate signature and original T0-to-T1 binding protocol rather than trusting those verifier outcomes as signed attestations.
- an assurance-chain invariant inspired by agent transaction-token monotonic attenuation: stronger downstream producers or agents must not silently upgrade weaker upstream actor/delegation provenance, with explicit tests against identity laundering;

The v0.2 TypeScript reference now includes a pure assurance-attenuation evaluator. It computes effective assurance over explicit dependency edges, preserves authoritative strength for unrelated downstream facts, and fails missing dependencies or cycles toward `unknown`.

- deterministic fuzzing with regression capture for malformed, deeply nested, cyclic, and oversized inputs;
- Go and Rust reference implementations consuming the same shared corpus;
- additional pinned real-world framework repositories;
- broader failure injection across external HTTP, brokers, workers/processes, and alternative databases;
- formalized graph/runtime invariants and, where useful, a small TLA+ or equivalent pipeline model;
- reference-corpus studies with explicit information-loss reports.

New language implementations must join the existing shared contract rather than define language-specific semantics.

## Control and compliance mappings

Additional SOC 2, ISO/IEC 27001, internal-catalog, or other control mappings are candidates only when control provenance and licensing are clear.

Mappings must continue to express evidence relevance or potential gaps. AuditSpec must not infer certification, compliance scores, or assessor conclusions from static or runtime heuristics.

## Permanent guardrails

The following are architectural constraints, not backlog items to relax:

- unresolved or truncated analysis never strengthens assurance;
- bounded non-observation is inconclusive unless the declared observation scope justifies a stronger statement;
- producer trust never broadens producer authority;
- cryptographic proof validity never broadens the signer's fact-scoped authority;
- stronger downstream evidence never upgrades weaker upstream provenance across an explicit semantic dependency;
- runtime evidence corroborates rather than rewrites static coverage;
- correlation identifiers do not create semantic graph edges by coincidence;
- control mappings do not become compliance verdicts;
- coding/source-writing authority remains separate from assessment authority unless an explicitly authorized integration says otherwise.
