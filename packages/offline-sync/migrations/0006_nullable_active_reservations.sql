-- Forward-only CTG9 reservation admission. Historical strings and replay digests are unchanged.
-- Execute this file atomically as the installation owner with full row visibility.
SET LOCAL row_security = off;
LOCK TABLE offline.numbering_reservations IN SHARE ROW EXCLUSIVE MODE;

DO $upgrade$
DECLARE collisions jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.tenant_id, c.device_id, c.shift_scope)
    INTO collisions
    FROM (
      SELECT tenant_id, device_id, NULLIF(shift_id, 'stynx:no-shift') AS shift_scope,
             array_agg(id ORDER BY id) AS reservation_ids
        FROM offline.numbering_reservations
       WHERE status IN ('reserved', 'blocked') AND valid_until > clock_timestamp()
       GROUP BY tenant_id, device_id, NULLIF(shift_id, 'stynx:no-shift')
      HAVING count(*) > 1
    ) c;
  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'STY45',
      MESSAGE = 'Active numbering reservation collisions require lifecycle resolution before upgrade.',
      DETAIL = collisions::text;
  END IF;
END
$upgrade$;

ALTER TABLE offline.numbering_reservations ALTER COLUMN shift_id DROP NOT NULL;
ALTER TABLE offline.numbering_reservations ADD COLUMN reservation_origin text NOT NULL DEFAULT 'e6'
  CONSTRAINT numbering_reservations_origin_check CHECK (reservation_origin IN ('e6', 'ctg9'));
ALTER TABLE offline.numbering_reservations ADD CONSTRAINT numbering_reservations_e6_shift_check
  CHECK (reservation_origin <> 'e6' OR shift_id IS NOT NULL);

CREATE INDEX numbering_reservations_active_scope_idx
  ON offline.numbering_reservations (tenant_id, device_id, (NULLIF(shift_id, 'stynx:no-shift')), valid_until)
  WHERE status IN ('reserved', 'blocked');

-- A written scope row makes snapshot-isolation contenders conflict, even when their range
-- rows differ. Advisory locks alone do not refresh repeatable-read snapshots.
CREATE TABLE offline.numbering_reservation_scopes (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  device_id text NOT NULL CHECK (octet_length(device_id) BETWEEN 1 AND 255),
  shift_scope text NOT NULL,
  generation uuid NOT NULL,
  PRIMARY KEY (tenant_id, device_id, shift_scope)
);
ALTER TABLE offline.numbering_reservation_scopes OWNER TO stynx_owner;
ALTER TABLE offline.numbering_reservation_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.numbering_reservation_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.numbering_reservation_scopes FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
REVOKE ALL ON offline.numbering_reservation_scopes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON offline.numbering_reservation_scopes TO stynx_app;
GRANT SELECT ON offline.numbering_reservation_scopes TO stynx_reader;

CREATE FUNCTION offline.guard_active_numbering_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.reservation_origin IS DISTINCT FROM OLD.reservation_origin OR
    NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR
    NEW.device_id IS DISTINCT FROM OLD.device_id OR
    NEW.shift_id IS DISTINCT FROM OLD.shift_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'STY46', MESSAGE = 'Numbering reservation scope and origin are immutable.';
  END IF;
  IF NEW.status NOT IN ('reserved', 'blocked') OR NEW.valid_until <= clock_timestamp() THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'stynx-offline-active:' || jsonb_build_array(NEW.tenant_id::text, NEW.device_id,
      NULLIF(NEW.shift_id, 'stynx:no-shift'))::text, 0));
  INSERT INTO offline.numbering_reservation_scopes (tenant_id, device_id, shift_scope, generation)
    VALUES (NEW.tenant_id, NEW.device_id,
      jsonb_build_array(NULLIF(NEW.shift_id, 'stynx:no-shift'))::text, gen_random_uuid())
    ON CONFLICT (tenant_id, device_id, shift_scope)
    DO UPDATE SET generation = gen_random_uuid();
  IF NEW.valid_until <= clock_timestamp() THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM offline.numbering_reservations r
     WHERE r.tenant_id = NEW.tenant_id AND r.device_id = NEW.device_id
       AND NULLIF(r.shift_id, 'stynx:no-shift') IS NOT DISTINCT FROM NULLIF(NEW.shift_id, 'stynx:no-shift')
       AND r.id <> NEW.id AND r.status IN ('reserved', 'blocked') AND r.valid_until > clock_timestamp()
       AND (NEW.reservation_origin = 'ctg9' OR r.reservation_origin = 'ctg9')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'STY44',
      MESSAGE = 'An active numbering reservation already exists for this device and shift.';
  END IF;
  RETURN NEW;
END
$guard$;
ALTER FUNCTION offline.guard_active_numbering_reservation() OWNER TO stynx_owner;
REVOKE ALL ON FUNCTION offline.guard_active_numbering_reservation() FROM PUBLIC;
CREATE TRIGGER numbering_reservations_active_scope_guard
  BEFORE INSERT OR UPDATE ON offline.numbering_reservations
  FOR EACH ROW EXECUTE FUNCTION offline.guard_active_numbering_reservation();
