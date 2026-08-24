# Frappe / ERPNext integration

Frappe's native `Version`, `Access Log`, document history and related framework features should remain the low-level history mechanisms. AuditSpec complements them with semantic business, security, authorization and agent actions.

Examples include:

- `estimate.approve`
- `member.role_change`
- `project.update`
- `export.denied`
- `agent.tool.call`

A future Frappe adapter should:

1. Preserve the immediate actor separately from delegated principals and agent identity.
2. Capture Frappe authorization/permission decisions without re-evaluating them solely for audit.
3. Identify DocType records as AuditSpec targets and affected users/organizations as subjects where appropriate.
4. Capture semantic before/after fields rather than dumping complete documents.
5. Redact passwords, API credentials, secrets and unnecessary personal data before persistence.
6. Correlate web/API/background/agent execution with request, trace, session, turn and tool-call identifiers when available.
7. Emit authoritative evidence at the service/framework boundary that actually performs the mutation.
8. Use same-transaction persistence or a reliable outbox pattern when possible.
9. Coexist with Frappe's native audit/history features rather than attempting to replace them.

Inspector work should eventually recognize common mutation paths such as `doc.insert`, `doc.save`, `doc.submit`, `doc.cancel`, `doc.delete`, and `frappe.db.set_value`, then report semantic AuditSpec coverage and confidence instead of assuming every low-level database write requires its own business audit event.
