# AuditSpec

**An open specification for auditable actions by humans, services, and AI agents.**

AuditSpec defines a vendor-neutral semantic contract for product audit events. It focuses on who acted, on whose behalf, what action was attempted, what resources and subjects were involved, whether the action was authorized, whether execution succeeded, what changed, how the action correlates with distributed traces and agent sessions, and what evidence supports the assertion.

## Status

This repository is an early `v0.1` working draft. Breaking changes are still expected while the Core and executable assurance surfaces are being completed.

## AuditSpec is

- A semantic specification for auditable actions and evidence.
- A JSON Schema and executable conformance corpus.
- A model for humans, services, API keys, automation, and AI agents.
- A model for delegation, impersonation, authorization, execution results, correlation, redaction, evidence trust, ordering, and extensions.
- An executable Inspector and assessment model for finding auditability gaps.
- A foundation for framework adapters, agent/MCP inspection, CI assessment, runtime evidence, provenance, and compliance evidence mappings.

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
- `schema/` - JSON Schemas and canonical examples for events, assessments, diffs, remediation, verification, and control mappings.
- `spec/` - focused design notes, including delivery/retry semantics.
- `profiles/` - optional semantic/behavioral profiles such as agent and atomicity.
- `conformance/` - valid and invalid vectors shared by implementations.
- `tools/conformance/` - executable schema validator and container runner.
- `implementations/` - TypeScript, Ruby, and Python executable reference implementations.
- `frameworks/` - framework adapters and integration guidance.
- `mappings/` - CloudEvents, OpenTelemetry, W3C PROV, OSCAL guidance, and control mapping profiles.
- `lab/postgres-atomicity/` - executable PostgreSQL failure-injection reference for transactional audit intent.
- `docs/inspector.md` - system assessment model.
- `docs/assurance-invariants.md` - conservative graph/evidence safety properties.
- `docs/testing.md` - conformance, property, mutation, and behavioral testing strategy.
- `docs/github-action.md` - advisory PR ratchet integration.
- `docs/mcp.md` - MCP server and agent-facing tools.
- `docs/runtime-corroboration.md` - static/runtime evidence separation, observation scope, runtime query/diff semantics and producer model.
- `agents/` - instructions for coding agents implementing AuditSpec.
- `references/` - prior art and attribution.
- `WORKING_NOTES.md` - temporary v0.1 design backlog; intended to be removed or promoted before release.

## Run schema conformance

```bash
pip install -r tools/conformance/requirements.txt
python tools/conformance/run.py
```

Or:

```bash
docker build -f tools/conformance/Dockerfile -t auditspec-conformance .
docker run --rm auditspec-conformance
```

## Reference implementations

The Core and non-Core JSON Schemas are exercised by three independent executable language implementations.

| Implementation | Current reference surface | CI |
| --- | --- | --- |
| TypeScript | validation, normalize, redaction, CloudEvents, delivery identity, Inspector, CLI, MCP, assessment/remediation/OSCAL | Node 22 |
| Ruby | validation, normalize, redaction, delivery identity/dedup, emitter | Ruby 3.4.10 and 4.0.6 |
| Python | validation, normalize, redaction, delivery identity/dedup, emitter | Python 3.11.16 and 3.14.7 |

All three consume the same repository-root schemas and shared valid/invalid conformance corpus. A language implementation that disagrees with the corpus is considered an interoperability defect rather than a language-specific interpretation.

## Testing and assurance hardening

AuditSpec deliberately uses multiple independent verification techniques:

- schema conformance with positive and targeted negative vectors;
- differential validation across TypeScript, Ruby, and Python;
- exhaustive bounded assurance truth-table tests;
- deterministic randomized property tests;
- conservative Assurance Graph invariants;
- Stryker mutation testing of the pure assurance evaluator;
- pinned real-world Rails/Frappe Inspector smoke;
- GitHub Action self-smoke;
- official NIST OSCAL schema validation;
- PostgreSQL failure-injection tests for atomic audit/outbox intent and retry.

The current TypeScript assurance evaluator reaches a 100% focused mutation score (88/88 generated mutants killed); the repository quality gate fails below 95% for changes to that semantic evaluator.

See `docs/testing.md` for scope and limitations.

## Inspector

The TypeScript reference includes the first executable Inspector. Current adapters are deliberately conservative and preserve uncertainty rather than claiming full program understanding.

```bash
cd implementations/typescript
npm install
npm run build
node dist/cli.js inspect ../.. --json
```

Initial adapters:

- Rails
- Frappe / ERPNext

The Inspector uses AST-assisted discovery, scope-aware calls, framework dispatch surfaces, a conservative cross-file Assurance Graph, all-path evaluation, static reachability, stable fingerprints, and base/head ratchets.

The canonical output is `schema/assessment-report.schema.json` and includes discovered boundaries, evidence, findings, confidence, audit coverage, and static reachability.

## Agent remediation loop

Assessment findings can be converted into a structured Remediation Plan and verified against a later assessment using stable finding fingerprints.

```bash
auditspec plan-remediation assessment.json
auditspec verify-remediation before.json after.json
```

The planner does not modify source code. A coding agent or developer performs the change through separate authorized tools; AuditSpec then re-assesses and reports resolved, still-open, and new findings.

```text
inspect
  -> query evidence
  -> explain gap
  -> plan remediation
  -> code change
  -> inspect again
  -> verify remediation
  -> map controls / export evidence
```

Verification is scoped to the evidence available to the active Inspector adapters. It is not a runtime proof or compliance verdict.

## GitHub Action

AuditSpec can run as a non-blocking PR ratchet. Existing findings remain visible in summary while inline warnings focus on gaps newly introduced by the pull request.

```yaml
steps:
  - uses: actions/checkout@v4

  - uses: sergii/auditspec@v0.1
    with:
      baseline: auto
```

The Action compares finding fingerprints, mutation reachability, and Assurance Graph topology. It can surface a newly exposed path to an existing mutation even when the mutation source itself did not change.

The Action runs inside the repository's GitHub Actions runner; source code does not need to be uploaded to an AuditSpec service.

## Runtime corroboration

Runtime Corroboration is a separate evidence layer. It compares static Assessment Reports with explicit runtime observations without rewriting static coverage or turning a bounded observation into proof about all execution paths.

The reference surface supports:

```bash
auditspec corroborate assessment.json runtime-evidence.json
auditspec diff-corroboration base-corroboration.json head-corroboration.json
auditspec query-corroboration corroboration.json --relation contradicts --trust authoritative
```

Corroboration preserves evidence kind, producer identity, trust, observation coverage and observation scope. Corroboration diffs compare stable contradiction targets and report whether their observation scopes are `comparable`, `partially_comparable`, `not_comparable`, or `unknown`.

A contradiction that is no longer reported is not automatically considered resolved. Runtime evidence remains corroboration, not a replacement for static findings or business-semantic truth.

See `docs/runtime-corroboration.md` for the producer model, observation-scope rules, query filters and limitations.

## MCP server

The same Inspector, graph, remediation, verification, evidence, runtime corroboration, producer registry, and control-mapping engines are exposed through a local MCP v2 stdio server:

```bash
cd implementations/typescript
npm install
npm run build
npm run mcp
```

Current tools include:

- `auditspec.validate_event`
- `auditspec.validate_agent_profile`
- `auditspec.inspect`
- `auditspec.get_findings`
- `auditspec.explain_gap`
- `auditspec.query_evidence`
- `auditspec.diff_assessments`
- `auditspec.build_assurance_graph`
- `auditspec.find_assurance_path`
- `auditspec.diff_assurance_graphs`
- `auditspec.plan_remediation`
- `auditspec.verify_remediation`
- `auditspec.corroborate_runtime`
- `auditspec.list_runtime_producers`
- `auditspec.diff_runtime_corroboration`
- `auditspec.query_runtime_corroboration`
- `auditspec.map_controls`
- `auditspec.export_oscal`

The MCP surface does not write source code in v0.1. Coding agents can use a structured remediation plan, make changes through their own authorized tools, and then verify the new assessment.

## Control mapping and OSCAL

AuditSpec keeps external control frameworks outside Core and Inspector rules. Versioned Control Mapping Profiles translate concrete AuditSpec findings into `potential_gap` or `relevant_evidence` relationships.

The first built-in profile is:

```text
mappings/controls/nist-sp800-53-r5.2.0.json
```

Use it with:

```bash
auditspec map-controls \
  assessment.json \
  mappings/controls/nist-sp800-53-r5.2.0.json
```

This is a relevance crosswalk, not a NIST control assessment or compliance score.

AuditSpec can export an Assessment Report into an OSCAL Assessment Results projection when the caller supplies real Assessment Plan context:

```bash
auditspec export-oscal assessment.json ./assessment-plan.json
```

CI validates generated Assessment Results against the verified official NIST OSCAL v1.2.3 JSON Schema. AuditSpec does not invent missing SSP/Assessment Plan context and does not convert Inspector heuristics into a compliance verdict.

## Delivery and atomicity

Logical event identity is `(source, id)`. At-least-once transport retries must not create false second audit actions, and the same identity with a different semantic payload is an identity conflict.

When a business mutation and durable audit record share a transactional store, they should commit or roll back together. When the final sink is external, durable outbox intent should join the business transaction and delivery should be retried separately.

The PostgreSQL reference lab verifies rollback on audit/outbox failure, business-failure rollback, stable retry identity, and publisher-crash recovery with idempotent sink delivery.

See `spec/delivery.md` and `profiles/atomicity/README.md`.

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
13. Assessment uncertainty is explicit; static heuristics must not masquerade as proof.
14. External control mappings express relevance, never certification by implication.
15. Incomplete graph/path analysis must fail toward `unknown`, never optimistic proof.
16. Delivery retries preserve logical event identity and remain separate from semantic action result.

## Direction

The intended ecosystem includes stronger framework adapters, agent-native remediation, GitHub PR assessment, provenance and observability mappings, richer control evidence bridges, runtime corroboration, integrity/tamper-evidence profiles, and eventually optional continuous-assurance cloud services. The Core specification remains useful independently of any cloud service.

## License

Licensed under the Apache License, Version 2.0. See `LICENSE`.
