# Core semantic decision guide

Use this guide when you know **what happened in your product** and need to decide how to represent it as an AuditSpec Core event.

It is intentionally shorter than SPEC.md. It does not replace the normative specification.

The goal is to answer one question at a time:

~~~text
what happened
    ↓
who directly acted
    ↓
who they represented
    ↓
what was acted on
    ↓
what authorization was actually known
    ↓
what execution actually did
    ↓
what evidence supports each fact
~~~

A Core-valid JSON document can still be semantically misleading. When in doubt, prefer an explicit weaker or unknown fact over a stronger fact you did not actually observe.

## 1. Choose event identity first

Ask:

> Is this a new logical audited occurrence, or another delivery attempt for an existing one?

For a new logical event, choose a stable source and a stable logical event id. The pair (source, id) identifies one logical AuditSpec event.

For a delivery retry:

~~~text
same source
same id
~~~

Do not generate a new event id merely because a queue, HTTP request, worker, or sink retried.

idempotency_key may correlate the application command, but it does not replace AuditSpec event identity.

<!-- scenario: retry-preserves-logical-event-identity -->

## 2. Choose source separately from producer

Ask:

> What stable system or bounded context owns this event identity namespace?

That is **source**.

Then ask:

> Which software component constructed this particular event?

That is **producer**.

Prefer:

~~~json
{
  "source": "urn:example:billing",
  "producer": {
    "name": "billing-worker",
    "version": "17"
  }
}
~~~

Avoid putting ephemeral deployment identity or version numbers into source unless they really define a different logical source namespace. Changing source changes the identity tuple.

<!-- scenario: source-is-not-producer-version -->

## 3. Identify the immediate actor

Ask:

> Which entity directly caused the audited operation?

That is **actor**.

Do not start with "Who ultimately wanted this?" Those can be different principals.

~~~text
human clicked button                  -> actor = user
service called downstream service     -> actor = service
API key directly authenticated call   -> actor = api_key
AI agent executed tool/business call  -> actor = agent
scheduled automation fired            -> actor = automation/system
~~~

If software merely constructed the audit JSON, it is not automatically the actor. That belongs under producer.

<!-- scenario: producer-is-not-actor -->

## 4. Preserve delegation instead of rewriting the actor

Ask:

> Did the immediate actor act for, because of, or under authority associated with another principal?

If yes, keep the immediate actor unchanged and add **delegation**.

For an AI agent acting for a user:

~~~json
{
  "actor": {
    "type": "agent",
    "id": "agent:7"
  },
  "delegation": [
    {
      "relationship": "on_behalf_of",
      "principal": {
        "type": "user",
        "id": "42"
      }
    }
  ]
}
~~~

Do not rewrite the agent as the user. actor is the immediate actor.

<!-- scenario: agent-on-behalf-of-user -->

### Delegation order

The array is nearest-first.

For:

~~~text
child agent -> parent agent -> user
~~~

write:

~~~text
actor = child agent

delegation[0] = parent agent
delegation[1] = user
~~~

Do not sort by importance, seniority, or ultimate responsibility.

<!-- scenario: nested-delegation-order -->

### Impersonation

If an operator impersonates another user, preserve the operator as actor.

Represent the impersonated identity in delegation using relationship = impersonation.

When safely available, retain a reason or ticket/reference.

<!-- scenario: impersonation-keeps-operator -->

## 5. Name the business action

Ask:

> What meaningful action was attempted?

Prefer stable dotted domain names:

~~~text
invoice.pay
invoice.approve
project.update
agent.tool.call
~~~

Prefer business intent over generic CRUD when the business meaning is known.

action describes the attempted audited operation. Whether authorization allowed it and whether execution succeeded are separate decisions below.

## 6. Separate targets from subjects

Ask two different questions.

### What was directly acted on?

Use **targets**.

### Who or what was materially affected, but was not the primary resource acted on?

Use **subjects**.

Example:

~~~text
refund mutates invoice INV-42
customer user:42 is materially affected
~~~

Recommended representation:

~~~json
{
  "targets": [
    {
      "type": "invoice",
      "id": "INV-42",
      "role": "primary"
    }
  ],
  "subjects": [
    {
      "type": "user",
      "id": "42",
      "role": "affected"
    }
  ]
}
~~~

Do not put every related entity into targets.

<!-- scenario: target-versus-subject -->

## 7. Record only the authorization decision you actually know

Ask:

> Was a concrete authorization decision for this action observed or recorded?

If yes, record that decision under **authorization**:

~~~text
allowed
denied
not_applicable
unknown
~~~

A scope, role, credential, capability, token claim, or policy applicability signal is not automatically a concrete allowed decision.

If capability context is known but the actual decision is not, do not manufacture one.

Depending on the integration, either omit authorization when it is not meaningful or available, or use decision = unknown when the decision itself is relevant but unresolved.

<!-- scenario: scope-is-not-authorization-decision -->

### Denied authorization

A denied business action should use:

~~~json
{
  "authorization": {
    "decision": "denied"
  },
  "result": {
    "status": "not_executed"
  }
}
~~~

because the intended business operation did not execute.

## 8. Record execution independently from authorization

Ask:

> What actually happened when execution was attempted?

Use **result.status**:

~~~text
succeeded
failed
partial
unknown
not_executed
~~~

A positive authorization decision does not imply successful execution.

For example:

~~~text
authorization allowed
database commit failed
~~~

becomes:

~~~json
{
  "authorization": {
    "decision": "allowed"
  },
  "result": {
    "status": "failed",
    "code": "db_unavailable"
  }
}
~~~

<!-- scenario: authorization-does-not-imply-execution -->

Likewise, failure to deliver the audit record does not mean the business action failed.

<!-- scenario: delivery-failure-is-not-action-failure -->

## 9. Add evidence by asking who observed each fact

For each important assertion, ask:

> Who produced the observation, and how authoritative are they for this specific fact?

Evidence trust is fact-scoped.

trust is one of:

~~~text
authoritative
attributed
self_reported
derived
~~~

An agent saying "my tool call succeeded" is useful, but it is still actor-controlled evidence for execution.

A server that actually executed the operation may be authoritative for that execution fact.

Keep both if both are useful:

~~~json
{
  "evidence": [
    {
      "kind": "agent_report",
      "producer": { "name": "agent-runtime" },
      "trust": "self_reported"
    },
    {
      "kind": "execution",
      "producer": { "name": "billing-service" },
      "trust": "authoritative"
    }
  ]
}
~~~

Do not upgrade the weaker source merely because it agrees with a stronger one.

<!-- scenario: agent-report-is-not-authoritative-execution -->

## 10. Use correlation without inventing causality

Ask:

> Do these identifiers only show that events participated in the same request, trace, or session, or do I actually know a causal or parent relationship?

Use request_id, trace_id, span_id, session_id, turn_id, and tool_call_id for **correlation** when appropriate.

Use causation_id and parent_event_id only when that semantic relationship is actually known.

Two events sharing a trace does not prove one caused the other.

<!-- scenario: trace-correlation-is-not-parenthood -->

## 11. Keep occurrence time separate from recording time

Ask:

> When did the action happen or the decision occur?

That is **occurred_at**.

Then ask:

> When was the AuditSpec event durably recorded?

That is **recorded_at**.

They may be nearly identical for synchronous recording or significantly different for asynchronous pipelines.

Do not overwrite occurrence time with queue or persistence time merely because the latter is easier to observe.

<!-- scenario: occurred-at-is-not-recorded-at -->

## 12. Keep business result separate from audit delivery

AuditSpec result.status describes the audited business action.

It does not describe HTTP delivery status, queue retry status, sink acceptance, publisher timeout, or duplicate-delivery handling.

Example:

~~~text
business payment succeeded
audit sink request timed out
publisher retried
sink accepted duplicate
~~~

The business result is still succeeded.

Delivery attempts belong in transport or runtime evidence and delivery-specific machinery, not by rewriting the business result.

## Minimal final review

| Question | Core field |
| --- | --- |
| Is this a new logical occurrence or a retry? | source + id |
| Which stable context owns this identity namespace? | source |
| Who directly caused the operation? | actor |
| Did that actor represent or impersonate another principal? | delegation |
| What meaningful operation was attempted? | action |
| What resources were directly acted on? | targets |
| Who or what was materially affected? | subjects |
| What concrete authorization decision was actually known? | authorization |
| What actually happened during execution? | result |
| Which component constructed the event? | producer |
| Who observed each supporting fact? | evidence[].producer |
| How strong is that producer for that fact? | evidence[].trust |
| Is an identifier correlation or proven causality? | correlation |
| When did the action happen? | occurred_at |
| When was the record durable? | recorded_at |

## A useful fail-weak rule

When the available data cannot support a strong semantic claim:

~~~text
do not guess
do not promote
do not collapse different facts
~~~

Prefer unknown, an omitted optional field, weaker evidence trust, or explicit separate delegation/evidence over an invented stronger assertion.

That principle is especially important for authorization, delegation, causality, and evidence authority.

## Related executable material

The paired anti-pattern and recommended scenarios are in examples/implementer-feedback/corpus.json.

The current corpus has evidence_status: "hypothesis". It is an engineering hypothesis set, not claimed observed user feedback.

The normative source remains:

- SPEC.md
- spec/actors.md
- spec/trust-model.md
- spec/delivery.md
