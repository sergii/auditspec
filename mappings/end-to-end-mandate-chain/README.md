# End-to-end mandate chain

This scenario composes the AuditSpec v0.2 identity and authorization research layers into one executable chain.

The implementation is:

`implementations/typescript/src/end-to-end-mandate-chain.ts`

The regression suite is:

`implementations/typescript/test/end-to-end-mandate-chain.test.ts`

## Scenario

The happy path is:

```text
human authorization artifact (AAE)
        |
        v
signed HTTP request evidence (RFC 9421)
        |
        v
actor/delegation evidence (RFC 8693)
        |
        v
AAE -> HumanMandate projection
        |
        v
deterministic HumanMandate evaluation
        |
        v
SignedHumanMandateProof
        |
        v
application execution receipt
        |
        v
database commit receipt
```

The evaluator keeps every layer visible rather than collapsing them into one boolean.

## Cross-layer checks

A complete positive chain requires all of these to hold:

- RFC 9421 verification is positive;
- method and target control data are covered;
- `content-digest` is covered;
- an external verifier positively binds the signed HTTP request to the exact `MandatedAction`;
- RFC 8693 identity/delegation context is verified;
- RFC 8693 current actor matches the agent named by the human authorization artifact;
- RFC 8693 represented subject matches the human principal named by the authorization artifact;
- the AAE projection is `ready`;
- deterministic HumanMandate evaluation is `within_mandate`;
- the generated mandate proof verifies and is itself authorization-positive.

Application execution and database commit are then tracked as separate evidence facts.

A database commit can remain authoritative for the persistence fact even when the authorization chain becomes unverifiable.

## Why request-to-action binding is explicit

A valid RFC 9421 signature is not enough to prove that the signed request corresponds to the same semantic business action evaluated by HumanMandate.

Even when `content-digest` is signed, AuditSpec still needs an explicit adapter/verifier that establishes:

```text
signed HTTP request payload
        ==
this exact MandatedAction
```

That mapping is deployment/application-specific.

Therefore the end-to-end evaluator accepts an explicit:

`request_action_binding_verified`

input rather than guessing from HTTP bytes.

## Assurance composition

The scenario uses the existing assurance-attenuation evaluator.

Example happy-path strengths:

```text
request signature                    authoritative
request -> action binding            authoritative
RFC 8693 actor                       attributed
RFC 8693 represented principal       attributed
delegation                           attributed
mandate authorization                authoritative
        |
        v
request authorized as this action    attributed
        |
        v
application execution                attributed

database commit                      authoritative
```

The weaker identity/delegation evidence limits the derived end-to-end authorization/execution assertion.

It does not weaken the independent database fact.

This is the concrete whole-system form of the identity-laundering invariant.

## Mutation scenarios

The executable regression suite contains a happy path plus six adversarial mutations.

### Amount changed

The human authorized one exact AAE action, but the attempted amount changes before execution.

Result:

```text
AAE exact action binding mismatch
        ->
source_denied
```

No HumanMandate evaluation or signed mandate proof is emitted.

### Actor substituted

The AAE still names `agent:7`, while RFC 8693 identifies `agent:attacker`.

The AAE mandate can independently evaluate successfully and its proof can independently verify, but the complete request/delegation/mandate chain is `unverifiable`.

A valid mandate proof cannot repair a contradictory actor chain.

### Delegation weakened

The RFC 8693 claims still contain the expected actor and principal, but token verification is false.

The mandate remains independently valid.

The end-to-end authorization assertion becomes unknown because unverified delegation evidence cannot be upgraded by stronger downstream mandate or execution evidence.

### Required constraint cannot be represented

The AAE includes a required stateful `rate_limit`.

The current stateless HumanMandate model cannot enforce it.

Result:

```text
required source restriction
        +
no lossless AuditSpec projection
        ->
unverifiable
```

The adapter does not drop the source restriction.

### Authorization replay check fails

The AAE is single-use, but the external single-use/replay verification is negative.

The signed artifact does not become an accepted positive mandate source.

### Execution after mandate expiry

The exact AAE action binding still matches, but the concrete action occurs outside the mandate validity window.

The result is:

```text
outside_mandate
authorized = false
```

The generated mandate proof can still be cryptographically valid evidence of this negative decision.

### Signed request not bound to the semantic action

RFC 9421 succeeds and the HumanMandate succeeds, but no trusted adapter proves that the signed HTTP request is the exact `MandatedAction`.

The complete chain remains `unverifiable`.

This prevents two independently valid artifacts about different actions from being correlated by convenience.

## Status model

The evaluator returns one of:

```text
complete
authorized_execution_unproven
outside_mandate
requires_fresh_authorization
source_denied
source_pending
unverifiable
```

`complete` means the authorization chain is positive and both application execution and database commit observations are present.

`authorized_execution_unproven` means the authorization chain is positive, but one or both execution/persistence observations are absent.

None of the other states grant end-to-end authority.

## Guardrail

The evaluator is a composition harness, not a new protocol.

It does not make RFC 9421 prove identity, RFC 8693 prove human intent, AAE prove execution, a database receipt prove authorization, or a mandate proof prove that a business side effect occurred.

The purpose is to make those boundaries executable and mutation-tested as one system.
