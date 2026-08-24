# AuditSpec v0.1 Working Draft

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are to be interpreted as normative requirements.

## 1. Scope

AuditSpec standardizes the semantic shape and minimum behavior of product audit events emitted by humans, services, automations, and AI agents.

## 2. Required fields

An AuditSpec event MUST contain:

- `spec_version`
- `id`
- `actor`
- `action`
- `target`
- `outcome`
- `occurred_at`
- `recorded_at`

## 3. Actor

`actor.type` MUST be one of:

- `user`
- `agent`
- `service`
- `api_key`
- `system`
- `automation`

An actor MAY include `on_behalf_of` to represent delegated action. Delegation MUST NOT overwrite the immediate actor identity.

## 4. Action

`action` SHOULD use a stable dotted domain name, for example `invoice.approve`, `project.update`, or `agent.tool.call`.

Action names SHOULD describe business intent when that intent is known. Generic CRUD names MAY be used when no stronger domain semantic exists.

## 5. Target

A target MUST contain a stable `type` and `id`. Audit storage SHOULD NOT rely on a foreign key whose deletion would remove audit history.

## 6. Outcome

`outcome` MUST be either `allowed` or `denied`.

A denied event SHOULD include `denial_reason` when it can be safely disclosed.

## 7. Changes

For meaningful state changes, an event MAY include:

- `changes.fields`
- `changes.before`
- `changes.after`

Implementations MUST redact secrets before snapshots are persisted.

## 8. Correlation

An event MAY contain `request_id`, `trace_id`, `session_id`, and `tool_call_id` under `correlation`.

When an OpenTelemetry trace exists, implementations SHOULD propagate its trace identifier rather than inventing an unrelated audit-only trace identifier.

## 9. Evidence trust

An event MAY include `evidence` with:

- `producer`
- `trust`

`trust` MUST be one of:

- `authoritative` - produced by the system that enforced or executed the action.
- `attributed` - produced by a trusted intermediary with attributable identity.
- `self_reported` - reported by the actor or actor-controlled runtime.
- `derived` - inferred from other evidence.

Consumers MUST NOT treat `self_reported` evidence as equivalent to `authoritative` evidence.

## 10. Time

`occurred_at` is when the audited action occurred. `recorded_at` is when the audit event was durably recorded.

Both MUST be RFC 3339 date-time values. Consumers SHOULD tolerate small clock skew.

## 11. Atomicity

When a successful business mutation and audit event are stored in the same transactional database, they SHOULD be committed in the same transaction and SHOULD fail closed.

When they cannot share a transaction, a reliable pattern such as a transactional outbox SHOULD be used.

Denied actions do not have a corresponding business mutation and MUST use a reliable audit path appropriate to the authorization boundary.

## 12. Immutability and retention

Audit records SHOULD be append-only at the application layer. Retention, deletion, cryptographic integrity, and archival are storage profiles and are not fully standardized in v0.1.

## 13. Transport

AuditSpec does not define transport. CloudEvents MAY be used as an envelope. OpenTelemetry MAY be used for trace correlation. Neither replaces AuditSpec semantics.
