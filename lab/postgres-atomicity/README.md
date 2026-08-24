# PostgreSQL Atomicity Lab

This lab is the executable reference for the experimental AuditSpec Atomicity Profile v0.1.

It uses a disposable PostgreSQL container and failure injection to verify durable audit intent behavior independently of any Rails, Frappe, or TypeScript framework adapter.

Run:

```bash
bash lab/postgres-atomicity/run.sh
```

The lab verifies:

1. a business mutation and same-store audit event commit together;
2. an audit insert failure rolls the business mutation back;
3. an outbox insert failure rolls the business mutation back;
4. a business constraint failure cannot leave an audit event claiming successful execution;
5. re-delivery of one logical outbox event preserves one durable event identity.

The lab does **not** prove external delivery, retention, tamper evidence, application-wide audit coverage, or runtime execution. Those are separate assurance properties.
