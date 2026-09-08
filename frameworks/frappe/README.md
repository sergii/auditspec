# Frappe / ERPNext integration

Frappe's native Version, Track Changes, and Access Log remain the low-level document/access history mechanisms. AuditSpec complements them with semantic business, authorization, security, delegation, agent, correlation, and evidence semantics.

## Semantic boundary

Prefer emitting AuditSpec at a controller/service boundary that knows business intent rather than treating every database write as a product audit event.

Examples:

- `estimate.approve`
- `member.role_change`
- `agent.project_update`
- `export.denied`

## Inspector surface

The current Inspector adapter is `frappe-ast-assisted-v0.1`. It recognizes Python/Frappe mutation calls structurally and combines them with framework-aware surfaces such as whitelisted functions, hooks, scheduler/background dispatch, and the Assurance Graph.

Common mutation surfaces include:

- `doc.save()`
- `doc.insert()`
- `doc.submit()`
- `doc.cancel()`
- `doc.db_set()`
- `doc.db_insert()` / `doc.db_update()`
- `frappe.db.set_value()` / `frappe.db.update()`
- `frappe.db.bulk_update()`
- `frappe.db.delete()`
- `frappe.db.truncate()`
- `frappe.delete_doc()`

Static evidence remains conservative. A resolved call path is not runtime proof.

### Background enqueue dispatch

The v0.1 Assurance Graph resolves Frappe background dispatch only from an exact `frappe.enqueue(...)` call with a statically literal dotted target.

Supported forms are:

```python
frappe.enqueue("wiki.jobs.rebuild_index")
frappe.enqueue(method="wiki.jobs.rebuild_index", queue="long")
```

The `method=` keyword is interpreted semantically rather than by taking the first dotted string from the call. For example, `queue="reports.high", method="wiki.jobs.rebuild_index"` resolves `wiki.jobs.rebuild_index`; the queue name cannot become a false job target.

If `method=` is present but dynamic, AuditSpec fails closed even when another keyword contains a dotted string. Calls such as `queue.enqueue(...)`, imported aliases, direct function references, `*args`/`**kwargs`, and other forms requiring Python import/name resolution are not treated as proven Frappe dispatch in v0.1.

A resolved target is linked to the actual Python function node and receives the `entrypoint` assurance role. This remains static framework evidence, not proof that the job executed.

## Transaction model

Frappe owns the normal request/job transaction lifecycle:

- successful state-changing web requests commit at the end of the request;
- uncaught request exceptions roll back;
- successful background/scheduled jobs commit after completion;
- uncaught job exceptions roll back;
- explicit `frappe.db.commit()` creates a transaction boundary;
- caught exceptions require application code to make the correct rollback decision.

`frappe.db.truncate()` is a special case: Frappe commits before the DDL statement and the truncate cannot be rolled back. AuditSpec must never claim normal same-transaction atomicity across that operation.

`frappe.db.set_value()` / `frappe.db.update()` and `frappe.db.bulk_update()` are direct DB mutation surfaces that bypass normal Document events/validations. They remain auditable mutation boundaries even when no DocType lifecycle hook fires.

## Reference adapter contract

`frameworks/frappe/auditspec_frappe.py` provides transaction-neutral primitives on top of the Python AuditSpec reference implementation.

### Same-store audit

`FrappeAuditAdapter.emit_same_store(event)` validates and persists the event using the injected storage function. It intentionally does not call `frappe.db.commit()` or `frappe.db.rollback()`, so the audit write joins the transaction already owned by the current Frappe request/job/patch/application boundary.

### Durable outbox

`FrappeAuditAdapter.stage_outbox(event)` writes a durable outbox intent in the current transaction. An optional publisher wake-up is registered through `frappe.db.after_commit.add(...)` only after the outbox insert succeeds.

The after-commit callback is only a wake-up optimization. The durable outbox row is the source of truth for retry/recovery. A callback failure after commit must not erase delivery intent.

### Operation semantics

`operation_semantics(...)` explicitly marks known special cases:

- `frappe.db.commit` -> transaction boundary
- `frappe.db.truncate` -> non-rollbackable
- `frappe.db.set_value` / `frappe.db.update` -> current transaction, document hooks bypassed
- `frappe.db.bulk_update` -> current transaction, document hooks bypassed

Unknown operations remain conservative rather than being upgraded to stronger assurance.

## Executable contract tests

Run the adapter tests with the Python reference implementation available:

```bash
pip install -r implementations/python/requirements.txt
python -m unittest frameworks/frappe/test_auditspec_frappe.py
```

CI runs this contract on Python 3.11 and 3.14.

These tests prove the AuditSpec adapter contract and transaction neutrality. They are not yet a full Frappe Bench runtime proof. A future heavier integration lab should run against a pinned Frappe site and verify actual request/job rollback/commit behavior end to end.

## Native history still matters

Do not disable Frappe Track Changes, Version, or Access Log merely because AuditSpec is present. Native history answers low-level document/access questions; AuditSpec answers semantic accountability questions and can correlate them with agents, authorization, traces, external evidence, control mappings, and runtime evidence.
