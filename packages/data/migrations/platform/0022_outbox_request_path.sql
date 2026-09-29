-- Tenant-scoped request delivery completes only its own CLAIMED attempt.
-- Existing FORCE RLS and tenant policies from 0021 continue to govern rows.
REVOKE UPDATE ON outbox.event_attempts FROM stynx_app;
GRANT UPDATE (
  result,error,completed_at,provider,protocol,request_bytes,request_sha256,
  request_headers,response_bytes,response_sha256,response_status,evidence_state
) ON outbox.event_attempts TO stynx_app;

CREATE FUNCTION outbox.guard_app_attempt_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog,outbox
AS $$
BEGIN
  IF current_user = 'stynx_app' THEN
    IF OLD.result IS DISTINCT FROM 'CLAIMED'
       OR OLD.completed_at IS NOT NULL
       OR NEW.result NOT IN ('SENT','ERROR')
       OR NEW.completed_at IS NULL
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.attempt_ordinal IS DISTINCT FROM OLD.attempt_ordinal
       OR NEW.legacy_message_id IS DISTINCT FROM OLD.legacy_message_id
       OR NEW.legacy_state IS DISTINCT FROM OLD.legacy_state THEN
      RAISE EXCEPTION 'completed or legacy attempt evidence is immutable to stynx_app'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guard_app_attempt_completion
BEFORE UPDATE ON outbox.event_attempts
FOR EACH ROW EXECUTE FUNCTION outbox.guard_app_attempt_completion();
