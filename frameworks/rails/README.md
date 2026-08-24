# Rails integration

AuditSpec recommends explicit domain-level audit events in the same database transaction as successful business mutations when possible.

```ruby
ApplicationRecord.transaction do
  before = invoice.attributes
  invoice.approve!

  AuditSpec.emit!(
    actor: Current.actor,
    action: "invoice.approve",
    target: invoice,
    before: before,
    after: invoice.attributes
  )
end
```

Model versioning libraries such as PaperTrail or Audited can coexist with AuditSpec. They answer lower-level history questions; AuditSpec focuses on semantic actions, delegation, authorization outcomes, and evidence.
