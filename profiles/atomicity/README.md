# AuditSpec Atomicity Profile v0.1

Status: experimental behavioral profile for the v0.1 working draft.

AuditSpec Core describes semantic audit events. This profile describes durability behavior around business mutations and durable audit intent.

It is intentionally storage-neutral at the normative level. The first executable reference lab uses PostgreSQL.

## Same-store atomicity

When a successful business mutation and its AuditSpec record are persisted in the same transactional store, implementations SHOULD write both inside one database transaction.

The required behavioral property is:

```text
business mutation committed
=> durable audit record committed
```

and, for the same transaction boundary:

```text
audit write fails
=> business mutation does not commit
```

The inverse is also required when the business mutation itself fails: an event claiming successful execution MUST NOT commit for a mutation that rolled back.

## External audit sinks

A fire-and-forget network call to an external audit service is not an atomic commit boundary.

When the final audit destination cannot participate in the business transaction, the application SHOULD persist durable audit intent in the same transaction as the mutation, typically through a transactional outbox.

```text
business transaction
  ├─ domain mutation
  └─ audit outbox record
       ↓ commit
publisher
       ↓ retryable delivery
external audit sink
```

The behavioral property becomes:

```text
business mutation committed
=> durable outbox intent committed
```

Delivery may occur later. Durable intent is the atomic guarantee; remote delivery is a separate reliability guarantee.

## Failure injection

A conforming behavioral test suite SHOULD inject at least these failures:

1. audit insert fails after the business write is attempted;
2. outbox insert fails after the business write is attempted;
3. business mutation fails before audit persistence;
4. publisher crashes after commit but before confirmed delivery;
5. the same logical event is delivered more than once.

The implementation MUST NOT infer success merely because a happy-path test passes.

## Idempotency

Retrying delivery of the same logical event MUST preserve the event identity.

Consumers SHOULD be able to deduplicate by AuditSpec event identity. A storage adapter MAY additionally use an idempotency key where its delivery model requires one.

A retry MUST NOT create a second logical audit action.

## Denied actions

Authorization denials normally have no business mutation transaction to join.

Denied actions therefore require a separate reliable persistence path at the authorization boundary. An implementation MUST NOT claim same-mutation atomicity for a mutation that was never allowed to execute.

## Scope of proof

Passing this profile demonstrates behavior for the tested storage/adapter configuration. It does not prove tamper resistance, retention policy, external sink availability, or application-wide discovery completeness.

Integrity and runtime corroboration are separate profiles/evidence layers.

## PostgreSQL reference lab

`lab/postgres-atomicity/` provides the first executable behavioral reference. It verifies:

- same-transaction success;
- rollback when audit persistence fails;
- rollback when outbox persistence fails;
- idempotent outbox delivery identity.
