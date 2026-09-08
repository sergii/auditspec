# Rails / ActiveRecord Atomicity Lab

This executable lab verifies the AuditSpec Atomicity Profile at a real ActiveRecord service boundary.

Current reference stack:

- ActiveRecord 8.1.3.1
- SQLite 2.9.6
- AuditSpec Ruby reference implementation

Run:

```bash
cd lab/rails-atomicity
bundle install
bundle exec ruby atomicity_test.rb
```

The lab verifies:

1. business mutation and same-store semantic audit row commit together;
2. a valid AuditSpec event whose audit row cannot persist causes the business mutation to roll back;
3. a transactional-outbox persistence failure causes the business mutation to roll back;
4. an invalid AuditSpec event is rejected before the mutation transaction begins.

This is a behavioral integration reference, not a requirement to use SQLite or these exact ActiveRecord models.

Production applications should place the mutation and durable audit/outbox intent at the service/domain transaction boundary that owns the business action.
