# AuditSpec v0.1 Working Draft

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** in this document are normative.

## 1. Scope

AuditSpec standardizes the semantic shape and minimum behavioral expectations of product audit events emitted by humans, services, automations, credentials, and AI agents.

AuditSpec describes meaningful actions and the evidence around them. It does not define an audit storage product, transport protocol, SIEM, event-sourcing system, telemetry backend, or compliance certification.

An AuditSpec event SHOULD let a consumer answer, when the information exists:

- Who directly caused the action?
- On whose behalf did they act?
- What did they attempt?
- Which resources and subjects were involved?
- Was the action authorized?
- Did execution succeed?
- What changed?
- Where did the action originate?
- Which request, trace, session, turn, or tool call caused it?
- What evidence supports the assertion and how trustworthy is that evidence?

## 2. Required core fields

An AuditSpec event MUST contain:

- `spec_version`
- `id`
- `source`
- `actor`
- `action`
- `result`
- `occurred_at`
- `recorded_at`

`targets`, `subjects`, `authorization`, `changes`, `origin`, `correlation`, `evidence`, `ordering`, `redactions`, `extensions`, and `metadata` are optional because not every auditable action has meaningful values for them.

## 3. Event identity and source

`id` identifies one logical AuditSpec event.

`source` identifies the bounded context or system in which that logical event originated. It SHOULD be a stable URI-reference such as `urn:example:billing` or `https://api.example.com`.

The pair `(source, id)` MUST identify one logical event occurrence. Retries and duplicate deliveries of the same logical event MUST retain the same `source` and `id`.

An implementation MAY include `idempotency_key` to correlate an event with a stable application command or request idempotency key. `idempotency_key` does not replace event identity.

## 4. Actor

`actor` is the immediate entity that directly caused the audited operation.

`actor.type` MUST be one of:

- `user`
- `agent`
- `service`
- `api_key`
- `system`
- `automation`

An AI agent acting for a user MUST remain `type: agent`; it MUST NOT be rewritten as the user. A service or credential acting for another principal likewise remains the immediate actor.

Actor snapshots MAY include stable display information needed to preserve historical readability after the live identity is renamed or deleted. Snapshot data MUST follow the privacy and redaction requirements of this specification.

## 5. Delegation and impersonation

Delegation MUST NOT overwrite the immediate actor.

An event MAY include an ordered `delegation` array. Each entry describes a relationship from the immediate actor, or the preceding delegation principal, to the next principal in the responsibility chain.

`relationship` MUST be one of:

- `on_behalf_of`
- `delegated_by`
- `impersonation`
- `assumed_role`

The first entry is nearest to the immediate actor. Later entries MAY describe transitive delegation, for example a subagent acting for a parent agent acting on behalf of a user.

An impersonation entry SHOULD preserve the operator as the immediate actor and the impersonated principal in `principal`. When safely available, the entry SHOULD include a reason or external ticket/reference.

## 6. Action

`action` SHOULD use a stable dotted domain name, for example `invoice.approve`, `project.update`, or `agent.tool.call`.

Action names SHOULD describe business intent when that intent is known. Generic CRUD names MAY be used when no stronger domain semantic exists.

`action_version` MAY identify the version of the semantic contract for an action. `action_schema` MAY identify an immutable schema URI for action-specific metadata or extensions. Changing the meaning of an existing action without versioning SHOULD be avoided.

## 7. Targets and subjects

`targets` describes resources directly acted upon. An event MAY have zero, one, or many targets.

Every target MUST contain a stable `type` and `id`. A target MAY include a role such as `primary`, `source`, or `destination`, plus a historical display snapshot or non-sensitive metadata.

`subjects` describes entities materially affected by the action even when they are not the primary resource being mutated. This generalizes concepts such as an affected user. A subject MUST contain `type` and `id` and MAY include a role such as `affected`, `beneficiary`, or `owner`.

Audit storage SHOULD NOT rely on foreign keys whose deletion would remove audit history.

## 8. Authorization

Authorization and execution result are different concepts and MUST NOT be collapsed into one field.

When an authorization decision is relevant, `authorization.decision` MUST be one of:

- `allowed`
- `denied`
- `not_applicable`
- `unknown`

Authorization MAY include a safe reason, evaluated scopes, and a policy identifier/version.

A denied authorization SHOULD include a safe reason when available. A denied audited action SHOULD have `result.status: not_executed` because the intended business action was not executed.

A successful authorization does not imply successful execution.

## 9. Execution result

`result.status` MUST be one of:

- `succeeded`
- `failed`
- `partial`
- `unknown`
- `not_executed`

`result` MAY include a stable machine-readable `code` and a safe human-readable `reason`.

For example, an action may have `authorization.decision: allowed` and `result.status: failed` when a database or downstream service fails after authorization.

## 10. Changes

For meaningful state changes, an event MAY include:

- `changes.fields`
- `changes.before`
- `changes.after`

Snapshots SHOULD contain only the information needed for audit interpretation. Implementations MUST redact credentials and secrets before persistence and SHOULD minimize unnecessary personal or regulated data.

## 11. Redaction and privacy

An event MAY include `redactions` entries to distinguish intentionally transformed or omitted values from values that never existed.

A redaction entry MUST identify a JSON Pointer-like `path`, a `method`, and a reason classification.

`method` MUST be one of:

- `omitted`
- `redacted`
- `hashed`
- `tokenized`
- `encrypted`

Implementations MUST NOT persist raw passwords, API secrets, session credentials, private keys, bearer tokens, or equivalent credential material in audit snapshots or metadata.

## 12. Producer and origin

`producer` identifies the software component that constructed the AuditSpec event. It MAY include a version, build identifier, and instance identifier.

`origin` describes where the audited interaction entered or occurred in the application. Standard fields include:

- `surface` - for example `web`, `api`, `cli`, `mcp`, `agent`, `cron`, `webhook`, or `system`.
- `service` - the application/service receiving the interaction.
- `client` - safe client attributes such as IP address or user-agent when policy permits.
- `location` - optional deployment region, zone, or other execution-location context.

Origin data SHOULD be minimized according to privacy requirements.

## 13. Correlation and causality

An event MAY include the following under `correlation`:

- `request_id`
- `trace_id`
- `span_id`
- `interaction_id`
- `session_id`
- `turn_id`
- `tool_call_id`
- `causation_id`
- `parent_event_id`

When an OpenTelemetry/W3C trace exists, implementations SHOULD propagate its trace and span identifiers rather than invent unrelated audit-only identifiers.

`causation_id` SHOULD identify the event or command that directly caused this event when such an identifier exists. `parent_event_id` MAY represent a parent AuditSpec event in an event hierarchy.

## 14. Evidence and trust

An event MAY contain an `evidence` array because one auditable assertion can be supported by multiple independent observations.

Every evidence item MUST include:

- `kind`
- `producer`
- `trust`

`trust` MUST be one of:

- `authoritative` - produced by the system that enforced or executed the asserted action.
- `attributed` - produced by a trusted intermediary with attributable identity.
- `self_reported` - reported by the actor or actor-controlled runtime.
- `derived` - inferred from other evidence.

Evidence MAY include a reference, timestamp, and content digest.

Consumers MUST NOT treat `self_reported` evidence as equivalent to `authoritative` evidence. Multiple evidence items MAY corroborate one another without becoming semantically identical.

Runtime, OpenTelemetry, OS, or future eBPF observations are corroborating evidence unless they are themselves authoritative for the specific assertion. Kernel-level observations generally do not establish application-level business meaning by themselves.

## 15. Time

`occurred_at` is when the audited action occurred or was decided. `recorded_at` is when the AuditSpec event was durably recorded.

Both MUST be valid RFC 3339 date-time values.

AuditSpec conformance runners MUST enforce RFC 3339 date-time validity even when the underlying JSON Schema implementation treats `format` as annotation-only.

Consumers SHOULD tolerate explicitly documented, bounded clock skew and MUST NOT infer causal ordering from wall-clock timestamps alone when stronger ordering/correlation information exists.

## 16. Ordering

AuditSpec does not require a globally ordered event stream.

When an implementation provides monotonic ordering, it SHOULD use:

```json
{
  "ordering": {
    "stream_id": "tenant:org_123",
    "sequence": 18421
  }
}
```

`sequence` MUST be interpreted only within its `stream_id`. Implementations MUST NOT imply global ordering unless they actually provide it.

## 17. Extensions and profiles

AuditSpec Core is intentionally small. Domain, framework, agent, compliance, provenance, privacy, integrity, and transport-specific information SHOULD be expressed through versioned profiles or namespaced extensions rather than by continuously expanding the core event.

Each `extensions` member MUST contain:

- `schema` - an immutable schema identifier/URI.
- `data` - extension-defined data.

Extension names SHOULD be globally namespaced, for example `dev.auditspec.agent` or `com.example.billing`.

An extension MUST NOT redefine the semantics of a core field.

## 18. Atomicity and reliable recording

When a successful business mutation and its audit event are stored in the same transactional database, they SHOULD be committed in the same transaction and SHOULD fail closed.

When they cannot share a transaction, a reliable pattern such as a transactional outbox SHOULD be used.

Denied actions have no corresponding successful business mutation and MUST use a reliable audit path appropriate to the authorization boundary.

Retrying publication or delivery MUST NOT create a second logical event. The same `(source, id)` MUST be preserved.

## 19. Immutability, retention, and integrity

Audit records SHOULD be append-only at the application layer.

Retention, erasure, archival, cryptographic integrity, signatures, hash chains, transparency receipts, and related storage guarantees are profiles and are not fully standardized by the Core v0.1 event.

Implementations MUST use accurate terms such as **tamper-evident** unless stronger guarantees are actually provided and documented.

## 20. Transport and external models

AuditSpec does not define transport.

CloudEvents MAY be used as an envelope. OpenTelemetry MAY be used for trace/log correlation. W3C PROV MAY be used for provenance relationships. OSCAL MAY be used for machine-readable control assessments and compliance evidence mappings.

These external models complement AuditSpec and do not replace AuditSpec business semantics.

## 21. Conformance

A conforming implementation MUST:

1. Accept every applicable valid canonical fixture.
2. Reject every applicable invalid canonical fixture.
3. Enforce normative semantic constraints that JSON Schema alone cannot reliably express.
4. Preserve event identity across retry/deduplication behavior.
5. Apply redaction before persistence when it is responsible for persistence.
6. Declare which optional profiles, mappings, and behavioral guarantees it implements.

Conformance levels and profile-specific behavioral suites will be expanded during the v0.1 working cycle.
