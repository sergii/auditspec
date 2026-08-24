# Frappe / ERPNext integration

Frappe's native Version and Access Log features remain the low-level document and access history mechanisms. AuditSpec complements them with semantic business, authorization, security, and agent actions.

## Semantic boundary

Prefer emitting AuditSpec at the controller/service boundary that knows business intent rather than treating every database write as a product audit event.

Examples:

- `estimate.approve`
- `member.role_change`
- `agent.project_update`
- `export.denied`

## Mutations the Inspector recognizes

The initial `frappe-heuristic-v0.1` adapter looks for common mutation surfaces including:

- `doc.save()`
- `doc.insert()`
- `doc.submit()`
- `doc.cancel()`
- `doc.db_set()`
- `doc.db_insert()` / `doc.db_update()`
- `frappe.db.set_value()` / `frappe.db.update()`
- `frappe.delete_doc()`

Direct database methods are especially important because Frappe documents that some of them bypass normal ORM triggers. The adapter therefore increases confidence around these mutation boundaries and looks for explicit authorization evidence when permission-bypassing patterns are present.

## Atomicity

Frappe transaction ownership is request/job dependent. A same-file AuditSpec marker is therefore classified as `partial` by the first heuristic adapter rather than being treated as proof of atomic persistence.

A future Frappe adapter should understand transaction lifecycle, background jobs, hooks, DocType controllers, and the actual AuditSpec storage implementation before upgrading that confidence.

## Native history still matters

Do not disable Frappe `Track Changes`, Version, or Access Log merely because AuditSpec is present. Native history answers low-level document/access questions; AuditSpec answers semantic accountability questions and can correlate them with agent, authorization, trace, and external evidence.
