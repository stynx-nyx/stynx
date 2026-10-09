-- ADR-OUTBOX-0003 D1 item 6 (UPS-OBX-10): the attempt-completion guard of 0022
-- no longer names the application role. Every role except the owner of
-- outbox.event_attempts (resolved from pg_class.relowner for TG_RELID and
-- compared by role identity, not membership) is held to the 0022 checks, so a
-- configured application role keeps the immutability guard. The trigger, its
-- table and its timing are unchanged; 0022 is not edited.
CREATE OR REPLACE FUNCTION outbox.guard_app_attempt_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog,outbox
AS $$
DECLARE
  table_owner oid;
  acting_role oid;
BEGIN
  SELECT c.relowner INTO table_owner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID;
  SELECT r.oid INTO acting_role FROM pg_catalog.pg_roles r WHERE r.rolname = current_user;
  IF acting_role IS DISTINCT FROM table_owner THEN
    IF OLD.result IS DISTINCT FROM 'CLAIMED'
       OR OLD.completed_at IS NOT NULL
       OR NEW.result NOT IN ('SENT','ERROR')
       OR NEW.completed_at IS NULL
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.event_id IS DISTINCT FROM OLD.event_id
       OR NEW.attempt_ordinal IS DISTINCT FROM OLD.attempt_ordinal
       OR NEW.legacy_message_id IS DISTINCT FROM OLD.legacy_message_id
       OR NEW.legacy_state IS DISTINCT FROM OLD.legacy_state THEN
      RAISE EXCEPTION 'completed or legacy attempt evidence is immutable outside the table owner'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
