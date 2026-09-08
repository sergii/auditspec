# AuditSpec implementation skill

Use this skill when adding, reviewing, or repairing AuditSpec coverage in an application.

## Workflow

1. Enumerate meaningful mutation, privileged-operation, authorization, impersonation, automation, and agent/tool boundaries.
2. Identify the immediate actor without rewriting it as a delegated principal.
3. Build the ordered delegation/impersonation chain when responsibility crosses principals.
4. Choose a stable semantic action name and action version/schema when applicable.
5. Identify all direct targets and materially affected subjects.
6. Record authorization decision separately from execution result.
7. Capture before/after snapshots only when they add audit value.
8. Remove secrets and sensitive material before persistence and record intentional redaction when useful.
9. Identify stable event source and software producer.
10. Propagate request, trace, span, interaction, session, turn, tool-call, and causation identifiers when available.
11. Record independent evidence producers and assign trust based on the real producer boundary.
12. Make successful mutation + audit persistence atomic when possible; otherwise use a reliable pattern such as a transactional outbox.
13. Preserve `(source, id)` across retries and duplicate delivery.
14. Add canonical conformance, integration, failure-path, and regression tests.
15. Report uncovered write/authorization paths as findings rather than silently assuming they are safe.

## Review questions

For every important path, ask:

- Who directly caused it?
- On whose behalf?
- What was attempted?
- What resources/subjects were involved?
- Was it authorized and by which policy?
- Did execution succeed?
- What changed?
- Where did it originate?
- Which trace/session/turn/tool call caused it?
- Which evidence source proves each assertion and with what trust?
- Could secrets or unnecessary personal data leak into the audit event?
- Can a business mutation commit without durable audit evidence?

## Rules

- Do not treat application logs, telemetry, database versioning, or traces as semantic audit coverage unless they actually preserve the required AuditSpec semantics.
- Do not claim a gap is certain when static or runtime evidence only supports a heuristic conclusion; preserve confidence in future assessment tooling.
- Prefer narrow, explicit semantic events over dumping entire application objects into `metadata`.
