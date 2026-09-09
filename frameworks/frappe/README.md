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

The current Inspector adapter is `frappe-ast-assisted-v0.1`. It recognizes Python/Frappe mutation calls structurally and combines them with framework-aware surfaces such as whitelisted functions, hooks, scheduler/background dispatch, DocType controller lifecycle methods, and the Assurance Graph.

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

### Whitelisted RPC entrypoints

A Frappe function receives the `entrypoint` assurance role only when the Python AST says that its exact `function_definition` belongs to a `decorated_definition` containing a direct `@frappe.whitelist` decorator or a conservatively proven imported alias of that decorator. AuditSpec does not search a loose window of preceding source lines.

Supported direct forms include stacked and multiline decorators:

```python
@frappe.whitelist()
def update_project(name):
    ...

@frappe.whitelist(allow_guest=True)
@validate_request
def public_update(name):
    ...

@frappe.whitelist(
    allow_guest=True,
    methods=["POST"],
)
def public_submit(name):
    ...
```

The v0.2 development line also supports module-level import aliases when import identity is statically proven before the decorated definition:

```python
from frappe import whitelist as api

@api(allow_guest=True)
def public_update(name):
    ...

from frappe import whitelist

@whitelist()
def public_submit(name):
    ...

import frappe as f

@f.whitelist()
def public_cancel(name):
    ...
```

A whitelist decorator on a neighboring function cannot strengthen a later function, even when it is only a few lines away. Decorator arguments may span multiple lines because attribution comes from the owned AST node rather than source-line proximity.

Alias resolution remains deliberately narrow. The import must be a direct module-level `from frappe import whitelist [as alias]` or `import frappe as alias` binding that occurs before the function definition. Conditional or wildcard imports, different-module lookalikes, duplicate/ambiguous bindings, imports after the definition, and aliases with intervening ambiguous use or rebinding fail closed rather than creating an entrypoint.

### Static hook dispatch

The v0.1 Assurance Graph parses `doc_events` and `scheduler_events` as literal Frappe hook structures rather than searching every string inside `hooks.py`.

Supported examples include:

```python
doc_events = {
    "Wiki Page": {
        "on_update": "wiki.handlers.audit_wiki_update",
        "on_submit": ["wiki.handlers.audit_wiki_submit"],
    },
}

scheduler_events = {
    "hourly": ["wiki.jobs.refresh_index"],
    "cron": {
        "*/15 * * * *": ["wiki.jobs.collect_metrics"],
    },
}
```

Only documented DocType event names and documented scheduler event names are accepted. Handler values must be literal dotted Python targets or literal lists of such targets. `cron` is modeled as a literal nested map whose keys are schedule expressions and whose values are handler lists.

Dynamic composition such as `**shared_hooks`, later `.update(...)` mutation, reassignment, duplicate literal keys, unknown event keys, and non-literal handler expressions fail closed. Dotted DocType names, cron expressions, or unrelated metadata strings are never interpreted as callable targets merely because they contain dots.

### Background enqueue dispatch

The v0.1 Assurance Graph resolves Frappe background dispatch from an exact `frappe.enqueue(...)` call when callable identity can be proven conservatively.

Supported forms include literal dotted targets, unshadowed top-level function references from the same Python module, and direct absolute `from ... import ...` references owned by the exact caller scope:

```python
frappe.enqueue("wiki.jobs.rebuild_index")
frappe.enqueue(method="wiki.jobs.rebuild_index", queue="long")

frappe.enqueue(rebuild_index, queue="long")
frappe.enqueue(method=rebuild_index, queue="long")

def rebuild_index():
    ...
```

A common Frappe local-import pattern is also supported:

```python
def update_search_index():
    from wiki.jobs import rebuild_index
    frappe.enqueue(rebuild_index, queue="long")


def update_search_index_with_alias():
    from wiki.jobs import rebuild_index as job
    frappe.enqueue(method=job, queue="long")
```

The `method=` keyword is interpreted semantically rather than by taking the first dotted string from the call. For example, `queue="reports.high", method="wiki.jobs.rebuild_index"` resolves `wiki.jobs.rebuild_index`; the queue name cannot become a false job target.

For a same-module function reference, AuditSpec requires exactly one top-level function with that name in the caller's `.py` file and rejects cases where the identifier may instead denote a parameter, local assignment, `global`/`nonlocal` binding, import, loop/exception binding, walrus assignment, or deleted/rebound name. This allows common Frappe forms such as `frappe.enqueue(rebuild_index)` without general Python dataflow inference.

For an imported function reference, AuditSpec requires one exact-scope, direct, absolute `from module import function` binding, optionally with an `as` alias, that appears before the enqueue call and resolves to one function in the inspected repository. The import is discovered from the Python AST and must belong to the same caller scope. Conditional or otherwise nested imports are retained as bindings for shadowing safety but do not create dispatch edges.

Relative imports, wildcard imports, duplicate imports of the same local name, imports after the enqueue call, rebound imported names, module-level imported function references, attribute references such as `tasks.rebuild_index`, `import module` references, dynamic expressions, `*args`/`**kwargs`, unrelated `.enqueue` methods, and other targets requiring broader Python import/name resolution fail closed rather than producing optimistic dispatch edges. If a proven import binding points to a target that is absent from the inspected repository, AuditSpec does not fall back to a same-named local function.

A resolved target is linked to the actual Python function node and receives the `entrypoint` assurance role. This remains static framework evidence, not proof that the job executed.

### Document background dispatch

The v0.1 Assurance Graph also resolves the Frappe `frappe.enqueue_doc(...)` worker surface when controller identity is statically known.

Supported examples include:

```python
frappe.enqueue_doc("Wiki Page", docname, "rebuild_index", queue="long")
frappe.enqueue_doc(doctype="Wiki Page", name=docname, method="rebuild_index")
```

`doctype` and `method` must be literal strings because together they determine which controller method is executed. The document `name` may be dynamic because it selects the runtime document instance without changing code-target identity.

The DocType name is mapped to the conventional controller path, for example `Wiki Page` to `.../doctype/wiki_page/wiki_page.py`. AuditSpec then requires the same conservative controller model used for lifecycle hooks: exactly one direct `Document` controller and exactly one matching method. A successful resolution creates a `frappe_enqueue_doc` framework dispatch edge to the concrete controller method and marks that target as an entrypoint.

Dynamic DocType or method identity, starred argument composition, ambiguous controllers across apps, indirect or aliased `Document` inheritance, and custom controller wiring fail closed. This is static framework reachability evidence, not proof that the queued job executed.

### Document `queue_action` dispatch

Frappe `Document.queue_action` is also modeled in a deliberately narrow form. AuditSpec recognizes an AST-proven `self.queue_action(...)` call only when it appears inside a conventional direct `Document` controller and the action name is a literal Python identifier.

For example:

```python
class WikiPage(Document):
    def on_update(self):
        self.queue_action("rebuild_index", queue="long")

    def rebuild_index(self):
        self.db_set("status", "Indexed")
```

This creates a separate `frappe_queue_action` background surface targeting `WikiPage.rebuild_index`. Keeping the queued action as its own entrypoint is intentional: authorization, audit, and transaction evidence on `on_update` is not automatically inherited by the later background execution.

Frappe itself first checks for an inner method named `_<action>` before executing the requested action. AuditSpec mirrors that rule for app-local methods, so `_rebuild_index` takes precedence over `rebuild_index` when both are defined. Framework-inherited inner actions such as `_save`, `_submit`, `_cancel`, and `_rename` are not mapped to a same-named app method unless the effective inner method is explicitly defined in the controller.

External receivers such as `doc.queue_action(...)`, dynamic action names, starred argument composition, custom/indirect controller inheritance, and targets requiring runtime type or import resolution fail closed.

### DocType controller lifecycle dispatch

The v0.1 Assurance Graph also models documented Frappe `Document` controller lifecycle methods as framework entrypoint surfaces when the controller can be resolved conservatively.

The supported subset requires:

- a conventional `.../doctype/<name>/<name>.py` controller path;
- exactly one explicit class deriving directly from `Document` or `frappe.model.document.Document`;
- a documented lifecycle method defined on that controller.

The modeled lifecycle names include validation/save/submit/cancel/update hooks such as `before_validate`, `validate`, `before_save`, `on_update`, `before_submit`, `on_submit`, `before_cancel`, `on_cancel`, `on_change`, rename hooks, and delete/trash hooks.

Each resolved lifecycle method gets a `frappe_document_hook` surface. The surface is the framework entrypoint; the edge targets the actual controller method. This distinction lets a mutation inside `on_update` or `on_submit` become statically reachable through the framework lifecycle without pretending the method was called directly by application code.

Storage primitives such as `db_insert` and `db_update` are intentionally not treated as ordinary lifecycle entrypoints. Custom or indirect controller inheritance, aliased `Document` bases, multiple candidate controller classes, and non-conventional controller paths fail closed until stronger Python/Frappe name and controller resolution is implemented.

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

These tests prove the AuditSpec adapter contract and transaction neutrality. Framework-runtime behavior is verified separately against a pinned real Bench site.

## Pinned Frappe Bench runtime lab

`lab/frappe-bench-atomicity/` provisions a pinned Frappe Bench site backed by MariaDB and runs AuditSpec against Frappe's real database, callback manager, request transaction policy, and background-job executor. CI runs it through `.github/workflows/frappe-bench-atomicity.yml`.

The lab verifies real same-store commit/rollback behavior, real database constraint-failure rollback for audit/outbox persistence, `frappe.db.after_commit` commit-vs-rollback semantics, `frappe.app.sync_database()` request commit/rollback policy, and `frappe.utils.background_jobs.execute_job()` success/failure transaction behavior.

This is framework-runtime evidence, not production certification. The v0.1 lab invokes request/job boundaries in-process; it does not start an external HTTP server or a separate Redis/RQ worker process, and it does not strengthen explicit commits, `frappe.db.truncate()`, custom database backends, or arbitrary extension code. See `lab/frappe-bench-atomicity/README.md` for the exact pinned stack and claim boundary.

## Native history still matters

Do not disable Frappe Track Changes, Version, or Access Log merely because AuditSpec is present. Native history answers low-level document/access questions; AuditSpec answers semantic accountability questions and can correlate them with agents, authorization, traces, external evidence, control mappings, and runtime evidence.
