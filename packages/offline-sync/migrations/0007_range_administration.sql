-- Forward-only range administration. Existing rows retain absent actor/receipt evidence.
ALTER TABLE offline.numbering_ranges ADD COLUMN consumer_attributes json
  CHECK (consumer_attributes IS NULL OR (json_typeof(consumer_attributes) = 'object'
    AND octet_length(consumer_attributes::text) <= 4096));
ALTER TABLE offline.numbering_ranges ADD COLUMN created_by text
  CHECK (created_by IS NULL OR octet_length(created_by) BETWEEN 1 AND 255);
ALTER TABLE offline.numbering_ranges ADD COLUMN cancelled_by text
  CHECK (cancelled_by IS NULL OR octet_length(cancelled_by) BETWEEN 1 AND 255);
ALTER TABLE offline.numbering_ranges ADD COLUMN cancellation_reason text
  CHECK (cancellation_reason IS NULL OR octet_length(cancellation_reason) <= 500);
ALTER TABLE offline.numbering_ranges ADD COLUMN cancelled_at timestamptz;
ALTER TABLE offline.numbering_ranges ADD COLUMN creation_key text
  CHECK (creation_key IS NULL OR octet_length(creation_key) BETWEEN 1 AND 255);
ALTER TABLE offline.numbering_ranges ADD COLUMN creation_fingerprint text
  CHECK (creation_fingerprint IS NULL OR creation_fingerprint ~ '^sha256:[0-9a-f]{64}$');
ALTER TABLE offline.numbering_ranges ADD COLUMN creation_receipt jsonb
  CHECK (creation_receipt IS NULL OR jsonb_typeof(creation_receipt) = 'object');
ALTER TABLE offline.numbering_ranges ADD CONSTRAINT numbering_ranges_creation_evidence_check
  CHECK ((creation_key IS NULL AND creation_fingerprint IS NULL AND creation_receipt IS NULL)
    OR (creation_key IS NOT NULL AND creation_fingerprint IS NOT NULL
      AND creation_receipt IS NOT NULL AND created_by IS NOT NULL));
ALTER TABLE offline.numbering_ranges ADD CONSTRAINT numbering_ranges_cancellation_evidence_check
  CHECK ((cancelled_by IS NULL AND cancelled_at IS NULL AND cancellation_reason IS NULL)
    OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL AND isfinite(cancelled_at)
      AND status = 'cancelled'));
ALTER TABLE offline.numbering_ranges ADD CONSTRAINT numbering_ranges_administered_cancellation_check
  CHECK (created_by IS NULL OR status <> 'cancelled'
    OR (cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL));
CREATE UNIQUE INDEX numbering_ranges_tenant_creation_key_uq
  ON offline.numbering_ranges (tenant_id, creation_key) WHERE creation_key IS NOT NULL;

CREATE FUNCTION offline.guard_numbering_range_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
DECLARE trusted_actor text := current_setting('app.actor_id', true);
BEGIN
  -- The whitespace set is ECMAScript String.trim(), matching Database.requireActor.
  IF btrim(trusted_actor, E' \t\n\r\f\013' ||
      U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = ''
  THEN trusted_actor := NULL; END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.created_by IS NOT NULL OR OLD.creation_key IS NOT NULL OR OLD.cancelled_by IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'STY49', MESSAGE = 'Administered numbering range history cannot be deleted.';
    END IF;
    RETURN OLD;
  END IF;
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class
      WHERE oid = TG_RELID)) THEN
    IF (TG_OP = 'INSERT' AND NEW.created_by IS NOT NULL
        AND NEW.created_by IS DISTINCT FROM trusted_actor)
      OR (((TG_OP = 'INSERT' AND NEW.cancelled_at IS NOT NULL)
          OR (TG_OP = 'UPDATE' AND OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL))
        AND NEW.cancelled_by IS DISTINCT FROM trusted_actor)
    THEN
      RAISE EXCEPTION USING ERRCODE = 'STY48', MESSAGE = 'Range provenance must use the trusted transaction actor.';
    END IF;
  END IF;
  IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
  IF ((OLD.created_by IS NOT NULL OR OLD.creation_key IS NOT NULL OR OLD.cancelled_by IS NOT NULL)
      AND NEW.id IS DISTINCT FROM OLD.id)
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.creation_key IS DISTINCT FROM OLD.creation_key
    OR NEW.creation_fingerprint IS DISTINCT FROM OLD.creation_fingerprint
    OR NEW.creation_receipt IS DISTINCT FROM OLD.creation_receipt
    OR (OLD.cancelled_at IS NOT NULL AND (
      NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
      OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason))
    OR (OLD.status = 'cancelled' AND NEW.status <> 'cancelled')
    OR (OLD.created_by IS NOT NULL AND NEW.consumer_attributes::text IS DISTINCT FROM OLD.consumer_attributes::text)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'STY48', MESSAGE = 'Numbering range provenance and terminal history are immutable.';
  END IF;
  IF (NEW.id IS DISTINCT FROM OLD.id OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.org_unit_id IS DISTINCT FROM OLD.org_unit_id
    OR NEW.entity_type IS DISTINCT FROM OLD.entity_type OR NEW.series IS DISTINCT FROM OLD.series
    OR NEW.start_number IS DISTINCT FROM OLD.start_number OR NEW.end_number IS DISTINCT FROM OLD.end_number)
    AND EXISTS (SELECT 1 FROM offline.numbering_reservations r WHERE r.tenant_id = OLD.tenant_id AND r.range_id = OLD.id)
  THEN
    RAISE EXCEPTION USING ERRCODE = 'STY48', MESSAGE = 'Referenced numbering range bounds and scope are immutable.';
  END IF;
  RETURN NEW;
END
$guard$;
ALTER FUNCTION offline.guard_numbering_range_history() OWNER TO stynx_owner;
REVOKE ALL ON FUNCTION offline.guard_numbering_range_history() FROM PUBLIC;
CREATE TRIGGER numbering_ranges_history_guard BEFORE INSERT OR UPDATE OR DELETE ON offline.numbering_ranges
  FOR EACH ROW EXECUTE FUNCTION offline.guard_numbering_range_history();
