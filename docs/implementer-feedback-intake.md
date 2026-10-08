# Implementer feedback intake

AuditSpec uses structured implementer feedback to decide where documentation, examples, tooling, or eventually Core semantics need to become clearer.

The public intake form is:

`.github/ISSUE_TEMPLATE/implementer-feedback.yml`

The semantic hypothesis corpus is:

`examples/implementer-feedback/corpus.json`

## Evidence lifecycle

A submitted issue does **not** automatically change the corpus from hypothesis to observed.

The lifecycle is:

```text
public issue / integration review
        ↓
triage against existing scenario or new scenario
        ↓
sanitize and minimize
        ↓
maintainer review
        ↓
curated observation added to corpus
        ↓
corpus evidence_status recomputed
        ↓
docs/tooling/Core decision
```

This prevents a raw report, duplicate, misunderstanding of a different system, or sensitive context from silently becoming project evidence.

## What counts as an observation

A curated observation records only the minimum evidence needed to support the semantic confusion claim:

```json
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
```

Raw customer payloads, secrets, personal data, private repository contents, or long conversation transcripts do not belong in the corpus.

For private integration reviews, `source_ref` may be a stable private review identifier instead of a public URL. The committed observation still needs to be sanitized.

## Corpus evidence status

The top-level `evidence_status` is derived from curated observations:

```text
no scenarios have observations
    -> hypothesis

some, but not all, scenarios have observations
    -> mixed

every scenario has at least one observation
    -> observed
```

CI checks this relationship.

This is intentionally conservative. One observed scenario does not make every predicted scenario observed.

## Triage rules

For an incoming report:

1. Decide whether the report is about AuditSpec Core semantics rather than a framework/library bug.
2. Match it to an existing scenario when the underlying misconception is the same.
3. Create a new scenario only when the semantic confusion is materially different.
4. Minimize the event shape to the fields needed to explain the confusion.
5. Confirm the anti-pattern and recommended examples remain Core-valid when the lesson is semantic rather than structural.
6. Add a sanitized observation only after a maintainer can explain why the report supports the scenario.
7. Update the Core decision guide if the repeated confusion is not already clear there.

## What feedback should change first

Repeated confusion should normally pressure the surfaces in this order:

```text
decision guide
    ↓
quickstart / examples
    ↓
CLI explain / diagnostics
    ↓
schema annotations or non-Core tooling
    ↓
Core wording
    ↓
Core shape, only when the semantic model itself is wrong or persistently unworkable
```

A single confusing report is not, by itself, evidence that Core needs another field.

## Public issue safety

The GitHub form explicitly asks reporters not to include:

- credentials or tokens;
- personal data;
- real customer identifiers;
- proprietary payloads;
- private source code they cannot disclose.

Maintainers should redact or close unsafe reports rather than copy sensitive material into the corpus.

## Relationship to the decision guide

`docs/core-decision-guide.md` is the current first-line mitigation for the hypothesis corpus.

When a real observation is added, review whether the relevant decision-guide section:

- asks the right question;
- distinguishes the two concepts clearly;
- uses a realistic enough example;
- points to the normative section.

If it does not, fix the guide before considering a Core change.

## Machine checks

`tools/adoption/check-feedback-intake.mjs` verifies that:

- every current corpus scenario is present in the GitHub issue form;
- the issue form has an explicit `new / not listed` escape hatch;
- required intake fields remain present;
- the top-level corpus evidence status matches curated observation coverage;
- the intake document preserves the manual-curation and safety boundaries.

The feedback corpus schema also requires every committed observation to be explicitly sanitized.
