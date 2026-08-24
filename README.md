# AuditSpec

**An open specification for auditable actions by humans, services, and AI agents.**

AuditSpec defines a vendor-neutral semantic contract for product audit events. It focuses on who acted, on whose behalf, what action was attempted, what resources and subjects were involved, whether the action was authorized, whether execution succeeded, what changed, how the action correlates with distributed traces and agent sessions, and what evidence supports the assertion.

## Status

This repository is an early `v0.1` working draft. Breaking changes are still expected while the Core model is being completed.

## AuditSpec is

- A semantic specification for auditable actions and evidence.
- A JSON Schema and executable conformance corpus.
- A model for humans, services, API keys, automation, and AI agents.
- A model for delegation, impersonation, authorization, execution results, correlation, redaction, evidence trust, ordering, and extensions.
- A foundation for framework adapters, agent/MCP inspection, CI assessment, runtime evidence, provenance, and compliance mappings.

## AuditSpec is not

- An application logger.
- A SIEM.
- An observability backend.
- Event sourcing.
- CDC.
- A hosted audit-log SaaS.
- A replacement for OpenTelemetry, CloudEvents, W3C PROV, or OSCAL.
- A compliance certification.

## Core event

```json
{
  "spec_version": "0.1",
  "id": "aud_01JXYZ",
  "source": "urn:example:erp",
  "tenant": { "type": "organization", "id": "org_123" },
  "actor": {
    "type": "agent",
    "id": "agent_hanna"
  },
  "delegation": [
    {
      "relationship": "on_behalf_of",
      "principal": { "type": "user", "id": "usr_42" }
    }
  ],
  "action": "invoice.approve",
  "action_version": 1,
  "targets": [
    { "type": "invoice", "id": "INV-0042", "role": "primary" }
  ],
  "authorization": {
    "decision": "allowed",
    "scopes": ["invoice:approve"]
  },
  "result": {
    "status": "succeeded"
  },
  "origin": {
    "surface": "mcp",
    "service": { "name": "erp-service", "version": "2.1.0" }
  },
  "correlation": {
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "span_id": "00f067aa0ba902b7",
    "session_id": "sess_123",
    "turn_id": "turn_17",
    "tool_call_id": "call_123"
  },
  "evidence": [
    {
      "kind": "execution",
      "producer": { "name": "erp-service", "version": "2.1.0" },
      "trust": "authoritative"
    },
    {
      "kind": "agent_report",
      "producer": { "name": "agent-runtime" },
      "trust": "self_reported"
    }
  ],
  "occurred_at": "2026-08-24T15:00:00Z",
  "recorded_at": "2026-08-24T15:00:00.005Z"
}
```

## Repository map

- `SPEC.md` - normative v0.1 working specification.
- `schema/` - JSON Schema and canonical examples.
- `spec/` - focused design notes.
- `conformance/` - valid and invalid vectors shared by implementations.
- `tools/conformance/` - executable validator and container runner.
- `implementations/` - language-level reference implementations.
- `frameworks/` - framework integration examples.
- `agents/` - instructions for coding agents implementing AuditSpec.
- `references/` - prior art and attribution.
- `WORKING_NOTES.md` - temporary v0.1 design backlog; intended to be removed or promoted before release.

## Run conformance

```bash
pip install -r tools/conformance/requirements.txt
python tools/conformance/run.py
```

Or:

```bash
docker build -f tools/conformance/Dockerfile -t auditspec-conformance .
docker run --rm auditspec-conformance
```

## Design principles

1. Audit events describe meaningful actions, not every low-level state mutation.
2. Immediate actor identity and delegation are first-class and never collapsed.
3. Authorization decision and execution result are separate facts.
4. An event may involve zero, one, or many targets and affected subjects.
5. Secrets must be removed before persistence, and intentional redaction should be explicit.
6. Successful business mutations and their audit records should be atomic when they share a transactional store.
7. Audit history should outlive the entities it references.
8. Correlation identifiers connect audit semantics to distributed tracing and agent execution.
9. Evidence trust must be explicit. Self-reported agent evidence is not equivalent to authoritative server evidence.
10. AuditSpec does not require global event ordering; sequence semantics are scoped to a declared stream.
11. Core stays small through versioned profiles and namespaced extensions.
12. Storage and transport are implementation details. AuditSpec defines semantics.

## Direction

The intended ecosystem includes framework/language adapters, a system Inspector, MCP tools for agents, GitHub PR assessment, provenance and observability mappings, compliance evidence mappings, and optional runtime corroboration. The Core specification remains useful independently of any cloud service.

## License

Apache-2.0 is intended for the project. A full license file will be added before the first tagged release.
