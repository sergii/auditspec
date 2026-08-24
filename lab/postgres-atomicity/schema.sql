CREATE TABLE business_records (
  id text PRIMARY KEY,
  state text NOT NULL,
  CHECK (length(state) > 0)
);

CREATE TABLE audit_events (
  event_id text PRIMARY KEY,
  action text NOT NULL,
  target_id text NOT NULL
);

CREATE TABLE audit_outbox (
  event_id text PRIMARY KEY,
  payload jsonb NOT NULL
);
