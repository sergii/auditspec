# Delivery and Retry Semantics

AuditSpec defines event semantics independently of transport. Implementations may use databases, queues, HTTP, CloudEvents, transactional outboxes, files, or other delivery mechanisms.

This document defines the minimum identity and retry behavior needed to avoid turning transport retries into false audit history.

## Logical event identity

The canonical logical identity of an AuditSpec event is the tuple:

```text
(source, id)
```

`id` alone is not globally sufficient. Two independent producers may legitimately use the same identifier under different sources.

A retry of the same logical event MUST preserve both `source` and `id`.

## Duplicate delivery

AuditSpec assumes that at-least-once delivery is possible. Consumers SHOULD therefore tolerate duplicate delivery of the same logical event.

If the same `(source, id)` is received again with semantically identical payload, the consumer MAY classify it as a duplicate and avoid creating another durable logical event.

Duplicate transport delivery is not a second auditable action.

## Identity conflicts

The same `(source, id)` MUST NOT silently identify two different AuditSpec payloads.

If a consumer observes:

```text
same source
same id
different semantic payload
```

it SHOULD reject or quarantine the second occurrence and surface an identity conflict.

An identity collision is stronger than an ordinary duplicate and may indicate a producer defect, unsafe retry implementation, data corruption, or malicious fabrication.

## Idempotency keys

`idempotency_key` is optional and complementary to `(source, id)`.

Within a producer/source deduplication domain, one idempotency key SHOULD NOT silently become associated with multiple event identities.

Example:

```text
source = urn:example:erp
idempotency_key = invoice:INV-42:approve
```

A retry may reuse that key for the same logical event. Creating a new event ID for the same idempotency key SHOULD be treated as an explicit conflict or resolved through a documented producer policy.

## Payload comparison

Reference implementations may normalize JSON object-key ordering before comparing payloads so that representation order does not create false conflicts.

This normalization is **not** an integrity signature format and MUST NOT be described as RFC 8785 canonicalization unless the implementation actually conforms to RFC 8785.

Integrity hashes/signatures belong to the AuditSpec Integrity Profile.

## Delivery result vs action result

Transport delivery status is not `result.status`.

For example:

```text
AuditSpec action result: succeeded
Transport attempt 1: timeout
Transport attempt 2: accepted
Transport attempt 3: duplicate
```

The action still occurred once. Delivery attempts are reliability evidence about transporting its record.

Implementations MUST NOT rewrite the semantic action result merely because transport delivery was retried.

## Transactional outbox

When the final sink cannot participate in the business transaction, implementations SHOULD persist durable AuditSpec delivery intent in the same transaction as the business mutation.

A publisher may then deliver the outbox event with retry semantics.

The desired property is:

```text
business mutation committed
=> durable audit delivery intent committed
```

not:

```text
business mutation committed
=> one synchronous remote HTTP request happened
```

The latter does not provide atomic durability.

## Publisher crash recovery

A publisher may crash after a sink accepted an event but before the publisher persisted a delivery marker.

The safe recovery model is:

1. retry the same logical `(source, id)`;
2. let the sink recognize the duplicate or idempotency identity;
3. mark durable intent delivered only after confirmed acceptance/duplicate handling.

This provides effectively-once logical history over an at-least-once transport without claiming impossible universal exactly-once delivery.

## Reference implementations

The TypeScript reference includes an in-memory identity/deduplication model in `implementations/typescript/src/delivery.ts`.

The PostgreSQL behavioral lab in `lab/postgres-atomicity/` exercises durable outbox identity, publisher crash recovery, and idempotent sink acceptance under retry.
