# AuditSpec Threat Model

AuditSpec separates semantic correctness from storage/integrity guarantees. A valid JSON event can still be incomplete, fabricated, modified, omitted, replayed, or produced by a weak evidence source.

This document defines the initial threat categories the ecosystem should test and reason about.

## Assets

AuditSpec is intended to preserve trustworthy answers to questions such as:

- who acted
- on whose behalf
- what was attempted
- what was authorized
- what executed and with what result
- which resources/subjects were involved
- what changed
- where the interaction originated
- what evidence supports the assertion

## Threats

### Omission

A meaningful action occurs but no audit event is durably recorded.

Mitigations include same-transaction persistence, transactional outbox patterns, coverage inspection, failure injection, runtime reconciliation, and independent evidence sources.

### Fabrication

An actor or compromised component emits an event describing an action that never occurred.

Mitigations include authoritative server-side evidence, provenance, signatures/receipts, runtime corroboration, and cross-source reconciliation.

### Modification

An event is altered after creation.

Mitigations are implementation/profile specific and may include append-only storage, canonicalization, digests, signatures, hash chains, transparency services, access controls, and immutable archival.

### Deletion or truncation

Stored events or the tail/prefix of an audit stream are removed.

Mitigations may include retention controls, external replication, stream checkpoints, transparency receipts, and reconciliation against independent evidence.

### Reordering

Events are reordered to create a misleading narrative.

AuditSpec does not assume global wall-clock ordering. Use scoped `ordering`, causation relationships, trace context, and integrity profiles where ordering matters.

### Replay and duplicate delivery

The same logical event is delivered multiple times and interpreted as multiple actions.

Retries MUST preserve `(source, id)`. Consumers SHOULD deduplicate the same logical occurrence.

### Identity spoofing

A producer attributes an action to the wrong actor or principal.

Preserve immediate actor identity, authentication provenance, delegation relationships, and evidence producer trust. Self-reported identity is weaker than identity asserted at an authoritative boundary.

### Delegation spoofing

An agent/service claims it acted on behalf of a principal without valid authority.

Delegation is an assertion that may require separate authorization evidence. AuditSpec representation alone does not prove authority.

### Authorization/result conflation

A system records `allowed` and incorrectly implies success, or records failure and loses the fact that authorization succeeded.

AuditSpec separates `authorization` from `result` to prevent this ambiguity.

### Timestamp manipulation and clock skew

Wall clocks may be wrong or maliciously changed.

Consumers SHOULD correlate time with ordering, traces, causation, producer context, and integrity evidence rather than relying on timestamp order alone.

### Secret leakage

Audit snapshots or metadata accidentally persist passwords, API keys, tokens, private keys, session cookies, or other credentials.

Redaction MUST happen before persistence/transmission to less-trusted sinks. Conformance and adapters should include secret-leak regression tests.

### Privacy leakage

Audit events may retain unnecessary personal or regulated information indefinitely.

Profiles and adapters should minimize snapshots, classify sensitive fields, support explicit redaction/erasure strategies, and document retention policy.

### Log flooding / audit denial of service

An attacker causes excessive audit events to exhaust storage, throughput, or review capacity.

Implementations may use rate controls, quotas, aggregation for low-value events, separate ingestion paths, and resilient storage without dropping security-critical records silently.

### Audit recursion

Audit infrastructure itself causes actions that recursively emit unbounded audit events.

Implementations should define internal/non-auditable infrastructure paths or explicit recursion guards without suppressing meaningful privileged changes to the audit system.

### Weak evidence mistaken for proof

Client-side or agent self-reported events are displayed as if they were authoritative server evidence.

Every evidence item carries a trust classification. UI, scoring and compliance mapping MUST preserve that distinction.

## Trust boundaries

Typical systems contain multiple relevant boundaries:

```text
User / Agent
    |
    v
Client runtime             self-reported / attributed evidence
    |
    v
Authorization boundary     authoritative for policy decision
    |
    v
Application service        authoritative for business semantics/execution
    |
    v
Database / queue           authoritative for narrower persistence facts
    |
    v
OS / OTel / eBPF           runtime corroboration
    |
    v
Audit sink / archive       durability/integrity boundary
```

No single layer is automatically authoritative for every assertion.

## Security claims

AuditSpec Core defines semantics, not guaranteed completeness or tamper resistance.

Implementations MUST NOT claim that AuditSpec alone provides:

- tamper-proof logs
- non-repudiation
- complete runtime coverage
- compliance certification
- cryptographic provenance

Those claims require additional implementation evidence and/or explicit profiles.
