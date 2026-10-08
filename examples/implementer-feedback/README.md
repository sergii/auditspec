# Implementer confusion corpus

This directory contains machine-readable examples of places where a first-time AuditSpec implementer can produce a **Core-valid event that is still semantically misleading**.

The corpus is:

`corpus.json`

Its contract is:

`../../schema/implementer-feedback-corpus.schema.json`

## Important status

The current corpus has:

```json
{
  "evidence_status": "hypothesis"
}
```

These are engineering hypotheses derived from the normative Core semantics and from failure modes already exposed while building the reference implementation.

They are **not** claims that 13 external users have already reported these misunderstandings.

A scenario gains an `observations[]` entry only when actual implementer feedback, issue reports, integration reviews, or other attributable evidence supports it. The top-level `evidence_status` is then derived from how many scenarios have curated observations.

## Curated observations

Real reports enter through the structured GitHub Issue Form and the workflow in `../../docs/implementer-feedback-intake.md`.

A raw issue is not automatically corpus evidence. After maintainer review, the minimum sanitized observation can be attached to a scenario:

```json
{
  "observations": [
    {
      "id": "obs-2026-001",
      "source_kind": "github_issue",
      "source_ref": "https://github.com/sergii/auditspec/issues/123",
      "observed_at": "2026-10-08T12:00:00Z",
      "misconception_summary": "Implementer modeled represented user as actor instead of the executing agent.",
      "impact": "confusing",
      "sanitized": true,
      "resolution_status": "resolved"
    }
  ]
}
```

The corpus remains `hypothesis` while no scenario has observations, becomes `mixed` when some scenarios are observed, and becomes `observed` only when every scenario has at least one curated observation.

## Why the anti-patterns are valid JSON

Every `anti_pattern_events[]` entry intentionally passes AuditSpec Core validation.

That is the point.

JSON Schema can establish structural conformance, but it cannot decide whether an implementer selected the right real-world actor, represented a delegation chain in the right semantic order, or mislabeled a self-report as authoritative.

The corpus therefore exercises:

```text
schema-valid
    !=
semantically faithful
```

The paired `recommended_events[]` show the intended Core representation for the stated situation.

## Current scenarios

| Scenario | Main lesson |
| --- | --- |
| `agent-on-behalf-of-user` | Keep the AI agent as immediate actor and the user in delegation. |
| `nested-delegation-order` | Delegation is nearest-first, not responsibility-ranked. |
| `impersonation-keeps-operator` | Preserve the operator as actor during impersonation. |
| `source-is-not-producer-version` | Keep source stable; put deployable/version under producer. |
| `target-versus-subject` | Directly acted-on resources are targets; materially affected entities may be subjects. |
| `authorization-does-not-imply-execution` | An allow decision does not imply execution succeeded. |
| `scope-is-not-authorization-decision` | Capability context does not manufacture a concrete allow decision. |
| `agent-report-is-not-authoritative-execution` | Actor-controlled reports remain self-reported for execution facts. |
| `trace-correlation-is-not-parenthood` | Shared tracing context does not create causal/parent edges. |
| `retry-preserves-logical-event-identity` | A delivery retry keeps the same `(source, id)`. |
| `occurred-at-is-not-recorded-at` | Action time and durable recording time are separate facts. |
| `producer-is-not-actor` | Event-construction software is not automatically the business actor. |
| `delivery-failure-is-not-action-failure` | Audit transport failures do not rewrite business result. |

## Executable guarantees

The TypeScript test suite verifies that:

- the corpus matches its machine-readable schema;
- scenario ids are unique;
- the corpus covers the intended Core confusion areas;
- every anti-pattern event is Core-valid;
- every recommended event is Core-valid;
- every `expected_changed_fields` entry actually changes between the two representations;
- alternative single-event examples keep `source` and `id` stable unless identity/source is itself the lesson;
- referenced specification documents exist.

The repository-wide Python conformance runner also validates the corpus contract and a targeted invalid corpus vector.

## How to use it in review

When reviewing an integration, do not ask only:

> Does this event validate?

Also ask:

```text
Who directly acted?
Is delegation preserved?
Is source stable?
Is producer separate from actor/source?
What was directly targeted?
Who was materially affected?
Was authorization actually observed?
Did execution actually succeed?
Who produced each evidence item?
What is correlation versus proven causality?
Is this a retry or a second logical action?
When did the action happen versus when was it recorded?
```

The paired corpus examples make those questions concrete. For the corresponding first-pass modeling workflow, see `../../docs/core-decision-guide.md`.

## Feedback loop

When real implementer feedback arrives:

1. triage it through `../../docs/implementer-feedback-intake.md`;
2. attach a sanitized observation to an existing scenario or add a new scenario;
3. let the corpus-level evidence status follow observation coverage;
4. preserve the exact misconception in a minimized, non-sensitive form;
5. decide whether the fix belongs in docs/examples/tooling or actually requires a Core change;
6. add a regression example before simplifying or changing the specification.

Repeated confusion should first pressure documentation, naming, examples, and tooling.

It should not automatically cause Core expansion.
