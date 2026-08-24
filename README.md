# AuditSpec

**An open specification for auditable actions by humans, services, and AI agents.**

AuditSpec defines a vendor-neutral semantic contract for product audit events. It focuses on who acted, on whose behalf, what action occurred, what was affected, whether it was allowed or denied, what changed, how the action correlates with distributed traces and agent sessions, and how trustworthy the evidence is.

## Status

This repository is an early `v0.1` working draft. The specification is intentionally small and implementation-neutral.

## AuditSpec is

- A semantic specification for audit events.
- A JSON Schema and conformance fixture set.
- A model for humans, services, API keys, automation, and AI agents.
- A model for delegation, impersonation, authorization outcomes, correlation, and evidence trust.
- A set of framework and language reference implementations.

## AuditSpec is not

- An application logger.
- A SIEM.
- An observability backend.
- Event sourcing.
- CDC.
- A hosted audit-log SaaS.
- A replacement for OpenTelemetry or CloudEvents.

## Core event

```json
{
  "spec_version": "0.1",
  "id": "aud_01JXYZ",
  "tenant": { "id": "org_123" },
  "actor": {
    "type": "agent",
    "id": "agent_hanna",
    "on_behalf_of": { "type": "user", "id": "usr_42" }
  },
  "action": "invoice.approve",
  "target": { "type": "invoice", "id": "INV-0042" },
  "outcome": "allowed",
  "correlation": {
    "trace_id": "tr_123",
    "session_id": "sess_123",
    "tool_call_id": "call_123"
  },
  "evidence": {
    "producer": "server",
    "trust": "authoritative"
  },
  "occurred_at": "2026-08-24T15:00:00Z",
  "recorded_at": "2026-08-24T15:00:00.005Z"
}
```

## Repository map

- `SPEC.md` - normative v0.1 specification.
- `schema/` - JSON Schema and canonical examples.
- `spec/` - focused design notes for actors, correlation, trust, and redaction.
- `conformance/` - valid and invalid fixtures for every implementation.
- `implementations/` - language-level reference implementations.
- `frameworks/` - framework integration examples.
- `agents/` - instructions for coding agents implementing AuditSpec.
- `references/` - prior art and attribution.

## Design principles

1. Audit events describe meaningful actions, not every low-level state mutation.
2. Actor identity and delegation are first-class.
3. Allowed and denied actions are both auditable.
4. Secrets must be removed before persistence.
5. Successful business mutations and their audit records should be atomic when they share a transactional store.
6. Audit history should outlive the entities it references.
7. Correlation identifiers connect audit semantics to distributed tracing and agent execution.
8. Evidence trust must be explicit. A self-reported agent event is not equivalent to authoritative server evidence.
9. Storage and transport are implementation details. AuditSpec defines semantics.

## License

Apache-2.0 is intended for the project. A full license file will be added before the first tagged release.
