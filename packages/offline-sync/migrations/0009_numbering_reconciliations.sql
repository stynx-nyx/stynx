-- Forward-only ADR-MOBILE-OFFLINE-0005 D5. No historical reconciliation is inferred.
CREATE TABLE offline.numbering_reconciliations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  reservation_id uuid NOT NULL,
  actor_id text NOT NULL CHECK (octet_length(actor_id) BETWEEN 1 AND 255),
  created_at timestamptz NOT NULL CHECK (isfinite(created_at)),
  claimed_numbers bigint[] NOT NULL CHECK (array_position(claimed_numbers, NULL) IS NULL),
  user_ref text CHECK (user_ref IS NULL OR octet_length(user_ref) <= 255),
  idempotency_key text CHECK (idempotency_key IS NULL OR octet_length(idempotency_key) BETWEEN 1 AND 255),
  request_fingerprint text CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  result_json jsonb NOT NULL CHECK (jsonb_typeof(result_json) = 'object'),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES offline.numbering_reservations (tenant_id, id) ON DELETE RESTRICT,
  CHECK ((idempotency_key IS NULL AND request_fingerprint IS NULL)
    OR (idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL))
);
ALTER TABLE offline.numbering_reconciliations OWNER TO stynx_owner;
CREATE UNIQUE INDEX numbering_reconciliations_replay_uq
  ON offline.numbering_reconciliations (tenant_id, reservation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX numbering_reconciliations_reservation_history_idx
  ON offline.numbering_reconciliations (tenant_id, reservation_id, created_at DESC, id DESC);
ALTER TABLE offline.numbering_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.numbering_reconciliations FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.numbering_reconciliations FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON offline.numbering_reconciliations FROM PUBLIC, stynx_app, stynx_reader;
GRANT SELECT, INSERT ON offline.numbering_reconciliations TO stynx_app;
GRANT SELECT ON offline.numbering_reconciliations TO stynx_reader;

CREATE FUNCTION offline.guard_numbering_reconciliation_history() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
DECLARE trusted_actor text := current_setting('app.actor_id', true);
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE = 'STY54', MESSAGE = 'Numbering reconciliation history is append-only.';
  END IF;
  IF current_user <> pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class WHERE oid = TG_RELID))
    AND NEW.actor_id IS DISTINCT FROM trusted_actor THEN
    RAISE EXCEPTION USING ERRCODE = 'STY55', MESSAGE = 'Reconciliation provenance must use the trusted transaction actor.';
  END IF;
  RETURN NEW;
END
$guard$;
ALTER FUNCTION offline.guard_numbering_reconciliation_history() OWNER TO stynx_owner;
REVOKE ALL ON FUNCTION offline.guard_numbering_reconciliation_history() FROM PUBLIC;
CREATE TRIGGER numbering_reconciliations_history_guard BEFORE INSERT OR UPDATE OR DELETE
  ON offline.numbering_reconciliations FOR EACH ROW EXECUTE FUNCTION offline.guard_numbering_reconciliation_history();
