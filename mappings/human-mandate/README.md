# Human mandate research mapping

This directory maps AuditSpec against `draft-yossif-agent-mandate-problem-00`, "Problem Statement: Verifiable Human Mandates for Autonomous Agent Actions".

The source is an active individual Internet-Draft dated 22 July 2026. It is a problem statement, not an IETF Working Group standard and not a protocol specification. It explicitly defines no wire format, binding construction, constraint language, or evaluation mechanism.

Reference: https://datatracker.ietf.org/doc/draft-yossif-agent-mandate-problem/

## The gap

The draft separates two moments:

```text
T0 - authorization moment

human principal
    |
    | signs constraints / mandate
    v
agent receives bounded authority


T1 - execution moment

agent
    |
    | attempts concrete action
    v
verifier / resource
```

Valid credentials at T1 answer:

```text
may this agent act in general?
```

They do not answer:

```text
did the human authorize this concrete action,
with these parameters,
under these constraints?
```

AuditSpec treats those as separate assertions.

## Research evaluator

The TypeScript reference adds:

`implementations/typescript/src/human-mandate.ts`

with the pure function:

`evaluateHumanMandate(...)`

The evaluator is deliberately transport-neutral and does not parse tokens, perform cryptography, or define a signing format.

It consumes:

- a principal and optional specifically authorized agent;
- an explicit action and action parameters;
- hard and escalating constraints;
- an explicit time window;
- externally supplied mandate-signature verification status;
- externally supplied action-to-mandate binding verification status.

It returns one of:

```text
within_mandate
outside_mandate
requires_fresh_authorization
unverifiable
```

Only `within_mandate` produces `authorized: true`.

## Hard vs escalating constraints

A hard constraint violation means the action is outside the mandate.

Examples:

- wrong operation;
- counterparty outside an allowlist;
- value above an absolute ceiling;
- wrong executing agent;
- action outside the mandate validity window.

An escalating constraint means the action is no longer within autonomous authority and requires fresh human authorization.

Example:

```text
amount <= 1000     autonomous

1000 < amount <= 5000
                   return to human

amount > 5000      outside mandate
```

This preserves the source draft's distinction without pretending to define the interaction protocol for fresh authorization.

## Fail-closed rule

The evaluator does not infer permission from partial evidence.

These all produce `authorized: false`:

- mandate signature not verified;
- action-to-mandate binding not verified;
- constrained parameter missing;
- unsupported parameter type;
- malformed timestamps;
- hard-constraint violation;
- escalating-constraint crossing pending fresh authorization.

This corresponds directly to the problem statement's requirement that absence of a positive, verifiable within-mandate result must not become permission.

## Requirement coverage

`requirements.json` records explicit coverage against the six requirements in the problem statement.

Current summary:

```text
REQ-1 action-to-mandate cryptographic binding       partial
REQ-2 deterministic server-side verification        partial
REQ-3 fail-closed                                    preserved
REQ-4 independently verifiable evidence artifact    not represented
REQ-5 transport / format neutrality                  partial
REQ-6 escalation                                     partial
```

The most important missing pieces are intentional:

1. AuditSpec does not yet define the cryptographic T0 -> T1 binding construction.
2. AuditSpec does not emit a standalone signed mandate-evaluation proof that a third party can verify without trusting the executing system.
3. AuditSpec does not define how arbitrary wire payloads are canonically projected into the action parameters that a mandate constrains.
4. AuditSpec signals escalation but does not define the human interaction or replacement mandate.

## Relationship to existing AuditSpec identity work

The layers now remain distinct:

```text
RFC 9421 / DPoP
    who possessed/signed at request time?
          |
          v
RFC 8693
    who acted / on whose behalf?
          |
          v
Human mandate
    was this exact action within the human's constraints?
          |
          v
AuditSpec event/evidence
    what happened and what evidence supports each assertion?
```

A valid RFC 8693 delegation does not imply a positive human-mandate decision.

A positive mandate decision does not imply execution happened.

Execution evidence does not retroactively prove that the mandate itself was authentic.

These assertions should be correlated, not collapsed.

## ask -> approve -> act -> prove

The current AuditSpec interpretation is:

```text
ask
  proposed concrete action

approve
  T0 mandate + constraints

act
  T1 concrete action

prove
  mandate evaluation + execution evidence
```

This slice implements the deterministic evaluation boundary between `approve` and `act`. The cryptographic approval artifact and independently verifiable proof remain separate future work.

## Example

`examples/invoice-pay.json` contains a complete research example with:

- operation allowlisting;
- counterparty allowlisting;
- hard maximum amount;
- lower escalation threshold;
- time validity;
- named agent binding;
- explicit external verification outcomes.

The example is an AuditSpec research contract, not a proposed Internet protocol.
