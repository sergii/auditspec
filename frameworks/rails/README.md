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

## Reference adapter

`frameworks/rails/auditspec_rails.rb` provides transaction-neutral primitives on top of the Ruby AuditSpec reference implementation.

- `AuditSpec::Rails::Adapter#emit_same_store` validates and persists through an injected sink inside the caller's active transaction.
- `AuditSpec::Rails::Adapter#stage_outbox` persists a durable outbox intent before registering an optional publisher wake-up.
- `AuditSpec::Rails.active_record_after_commit(ActiveRecord)` uses `ActiveRecord.after_all_transactions_commit`, so nested transactions wake the publisher only after the outer transaction commits and never after rollback.

The after-commit callback is not delivery durability. If it fails, the database transaction has already committed. The durable outbox row remains the retry source of truth.

## Executable ActiveRecord proof

`lab/rails-atomicity/` runs against ActiveRecord 8.1 and SQLite in CI on Ruby 3.4 and Ruby 4.0. It verifies:

- business mutation + same-store audit commit together;
- audit persistence failure rolls back the business mutation;
- outbox persistence failure rolls back the business mutation;
- invalid AuditSpec events are rejected before mutation;
- outbox publisher wake-up runs only after outer commit;
- rollback suppresses the wake-up and removes the transactional outbox row;
- publisher wake-up failure after commit cannot roll back the already durable outbox.

## Inspector

The current Inspector adapter is `rails-ast-assisted-v0.1`. It combines AST mutation discovery with Rails routes, controllers, jobs, ActionCable dispatch and Assurance Graph paths. Static evidence remains conservative and is not runtime proof.

The route graph supports conservative literal `resources`/`resource`, namespaces, nesting, and literal `scope` composition. Supported `scope` forms may provide a positional path or literal `path`, `module`, and `as` options. Context is applied to both resource expansion and explicit `get`/`post`/`put`/`patch`/`delete` dispatch, so a scoped explicit route is not also treated as an unscoped root route.

Literal `constraints ... do` blocks with simple scalar key/value pairs are preserved in the canonical route-surface identity. A constraint remains a condition on an external entrypoint; it is not treated as authorization and it does not prove that a route is unreachable. Dynamic scopes, callable/complex constraints, and unsupported per-route routing options fail closed rather than producing guessed dispatch edges.

For ActionCable, the v0.1 graph models direct public methods on explicitly declared channel classes as client-callable RPC surfaces, plus direct `subscribed` and `unsubscribed` lifecycle callbacks. It also models the conventional `ApplicationCable::Connection < ActionCable::Connection::Base` `connect` and `disconnect` lifecycle as separate framework entrypoints, including the standard lexical `module ApplicationCable; class Connection ...` form.

Private/protected channel methods, indirect channel inheritance, lexical namespace resolution for arbitrary channel classes, inherited/concern-provided channel actions, custom connection-class configuration and indirect connection inheritance are not guessed.

Authorization observed in `connect` or `subscribed` is not automatically projected onto later RPC actions. Proving that connection/subscription state protects every subsequent channel action requires a stronger stateful framework/runtime model than the current static graph provides.

Model versioning libraries such as PaperTrail or Audited can coexist with AuditSpec. They answer lower-level history questions; AuditSpec focuses on semantic actions, responsibility/delegation, authorization, execution results, correlation, redaction and evidence.

Further Rails work can deepen Pundit/CanCanCan decision evidence, ActiveJob/Sidekiq context propagation, ActionCable inheritance/concern semantics, lexical/nested concern composition, more complex route constraints/framework-generated dispatch and runtime corroboration without changing the Core event contract.
