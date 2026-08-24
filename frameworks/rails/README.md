# Rails integration

AuditSpec recommends explicit domain-level audit events at the service/application boundary.

When the business mutation and audit record share the same database, persist them in the same transaction and fail closed.

```ruby
ApplicationRecord.transaction do
  before = invoice.slice("status")

  authorized = InvoicePolicy.new(Current.user, invoice).approve?

  unless authorized
    AuditSpec.emit!(
      source: "urn:example:billing",
      actor: Current.audit_actor,
      action: "invoice.approve",
      targets: [{ type: "invoice", id: invoice.id.to_s }],
      authorization: { decision: "denied", reason: "policy_denied" },
      result: { status: "not_executed" }
    )
    raise NotAuthorizedError
  end

  invoice.approve!

  AuditSpec.emit!(
    source: "urn:example:billing",
    actor: Current.audit_actor,
    delegation: Current.audit_delegation,
    action: "invoice.approve",
    targets: [{ type: "invoice", id: invoice.id.to_s }],
    authorization: { decision: "allowed" },
    result: { status: "succeeded" },
    changes: {
      fields: ["status"],
      before: before,
      after: invoice.slice("status")
    },
    correlation: Current.audit_correlation,
    evidence: [
      {
        kind: "execution",
        producer: { name: "billing-service" },
        trust: "authoritative"
      }
    ]
  )
end
```

A real adapter should avoid duplicating authorization evaluation merely for audit. Capture the decision produced by the application's real authorization boundary.

Model versioning libraries such as PaperTrail or Audited can coexist with AuditSpec. They answer lower-level history questions; AuditSpec focuses on semantic actions, responsibility/delegation, authorization, execution results, correlation, redaction and evidence.

Future Rails adapter work should cover ActiveRecord writes, service boundaries, Pundit/CanCanCan decisions, ActiveJob/Sidekiq context propagation, transactional outbox behavior and coverage inspection.
