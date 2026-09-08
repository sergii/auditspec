# Frappe Bench Atomicity Runtime Lab

This executable lab verifies AuditSpec/Frappe transaction semantics against a real pinned Frappe Bench site backed by MariaDB.

It is deliberately separate from `frameworks/frappe/test_auditspec_frappe.py`. The adapter contract test uses a fake database to prove that the adapter itself never owns commit/rollback. This lab proves how those primitives behave when they are attached to Frappe's actual database, callback manager, request transaction policy, and background-job executor.

## Pinned reference stack

- Frappe: `70b411faae940dd888f92ac3f82fc8587742c203`
- Bench: `c9d12503d9d7fbfd94086c3de3cd4ac23dd44823`
- MariaDB: `11.8`
- Redis: `redis:alpine` service containers on Frappe's conventional CI ports
- Python: `3.14`
- Node.js: `24` for Bench/Frappe bootstrap compatibility
- AuditSpec Python reference implementation and Frappe adapter from the checked-out AuditSpec revision

The GitHub Actions workflow creates an ephemeral Bench, creates a real site, and runs `runtime_test.py` inside the Bench virtual environment.

## What the lab proves

1. A business mutation and same-store AuditSpec event participate in the same real MariaDB transaction: caller rollback removes both and caller commit persists both.
2. A real database constraint failure while persisting an audit event can be followed by rollback of the business mutation without losing previously committed state.
3. A real database constraint failure while persisting a durable outbox row can be followed by rollback of the business mutation.
4. `frappe.db.after_commit` executes the AuditSpec publisher wake-up only after a real commit, and Frappe clears the pending callback on rollback.
5. Frappe's actual `frappe.app.sync_database()` request policy commits an unsafe `POST` transaction and rolls back a safe `GET` transaction; AuditSpec outbox wake-ups follow that boundary.
6. Frappe's actual `frappe.utils.background_jobs.execute_job()` commits a successful job and its durable outbox, while an audit persistence failure causes the job's business mutation to roll back.

The failure cases use real MariaDB uniqueness violations rather than a mocked exception, so the rollback proof crosses the adapter/storage boundary.

## Boundary of the claim

This is a pinned framework-runtime behavioral proof, not a production deployment certification.

The lab invokes Frappe's real request transaction function and real background-job executor in-process on a real Bench site. It does not start an external HTTP server, authenticate a network request, enqueue through Redis/RQ, or launch a separate worker process. Those transport/process layers can be added later without changing the transaction claims proven here.

It also does not claim that every Frappe extension, custom database backend, hook, or user-defined explicit `frappe.db.commit()` preserves the same atomicity boundary. Explicit commits and non-rollbackable operations such as `frappe.db.truncate()` remain separate semantics.

## Local execution

The CI workflow is the canonical reproducible path because it provisions the pinned services. If you already have an equivalent Bench site, run:

```bash
/path/to/frappe-bench/env/bin/pip install -r implementations/python/requirements.txt
/path/to/frappe-bench/env/bin/python \
  lab/frappe-bench-atomicity/runtime_test.py \
  --bench /path/to/frappe-bench \
  --site your-site-name
```

The site is expected to use a transactional database backend. The lab creates three isolated `tabAuditSpecLab*` tables in that ephemeral site and clears their rows between tests.
