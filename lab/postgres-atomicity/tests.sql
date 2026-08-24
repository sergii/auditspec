\set ON_ERROR_STOP on

TRUNCATE business_records, audit_events, audit_outbox;

-- Same-store success commits the business mutation and audit record together.
DO $$
BEGIN
  INSERT INTO business_records (id, state) VALUES ('success', 'active');
  INSERT INTO audit_events (event_id, action, target_id)
  VALUES ('aud_success', 'record.update', 'success');
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM business_records WHERE id = 'success') THEN
    RAISE EXCEPTION 'same-store success: business mutation missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_events WHERE event_id = 'aud_success') THEN
    RAISE EXCEPTION 'same-store success: audit event missing';
  END IF;
END
$$;

-- An audit persistence failure rolls back the attempted business mutation.
DO $$
BEGIN
  BEGIN
    INSERT INTO business_records (id, state) VALUES ('audit-failure', 'active');
    INSERT INTO audit_events (event_id, action, target_id)
    VALUES ('aud_failure', NULL, 'audit-failure');
    RAISE EXCEPTION 'expected audit persistence to fail';
  EXCEPTION
    WHEN not_null_violation THEN NULL;
  END;

  IF EXISTS (SELECT 1 FROM business_records WHERE id = 'audit-failure') THEN
    RAISE EXCEPTION 'audit failure committed the business mutation';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_events WHERE event_id = 'aud_failure') THEN
    RAISE EXCEPTION 'audit failure left a partial audit record';
  END IF;
END
$$;

-- An outbox persistence failure rolls back the attempted business mutation.
DO $$
BEGIN
  BEGIN
    INSERT INTO business_records (id, state) VALUES ('outbox-failure', 'active');
    INSERT INTO audit_outbox (event_id, payload)
    VALUES ('aud_outbox_failure', NULL);
    RAISE EXCEPTION 'expected outbox persistence to fail';
  EXCEPTION
    WHEN not_null_violation THEN NULL;
  END;

  IF EXISTS (SELECT 1 FROM business_records WHERE id = 'outbox-failure') THEN
    RAISE EXCEPTION 'outbox failure committed the business mutation';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_outbox WHERE event_id = 'aud_outbox_failure') THEN
    RAISE EXCEPTION 'outbox failure left a partial outbox record';
  END IF;
END
$$;

-- A business failure cannot leave an audit event claiming successful execution.
DO $$
BEGIN
  BEGIN
    INSERT INTO audit_events (event_id, action, target_id)
    VALUES ('aud_business_failure', 'record.update', 'business-failure');
    INSERT INTO business_records (id, state) VALUES ('business-failure', '');
    RAISE EXCEPTION 'expected business mutation to fail';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  IF EXISTS (SELECT 1 FROM business_records WHERE id = 'business-failure') THEN
    RAISE EXCEPTION 'invalid business mutation was committed';
  END IF;
  IF EXISTS (SELECT 1 FROM audit_events WHERE event_id = 'aud_business_failure') THEN
    RAISE EXCEPTION 'business failure left a success audit record';
  END IF;
END
$$;

-- Re-delivery of the same logical outbox event preserves one durable identity.
INSERT INTO audit_outbox (event_id, payload)
VALUES ('aud_retry', '{"spec_version":"0.1","id":"aud_retry"}'::jsonb);

INSERT INTO audit_outbox (event_id, payload)
VALUES ('aud_retry', '{"spec_version":"0.1","id":"aud_retry"}'::jsonb)
ON CONFLICT (event_id) DO NOTHING;

DO $$
DECLARE
  retry_count integer;
BEGIN
  SELECT count(*) INTO retry_count FROM audit_outbox WHERE event_id = 'aud_retry';
  IF retry_count <> 1 THEN
    RAISE EXCEPTION 'idempotent retry created % durable rows', retry_count;
  END IF;
END
$$;

SELECT 'AuditSpec PostgreSQL atomicity lab passed.' AS result;
