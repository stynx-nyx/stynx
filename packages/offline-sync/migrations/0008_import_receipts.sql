-- Owner-only, append-only custody for atomic offline imports. Apply after 0007.
CREATE TABLE offline.sync_import_receipts (
  source_identity_sha256 text PRIMARY KEY
    CHECK (source_identity_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  source_system text NOT NULL CHECK (octet_length(source_system) BETWEEN 1 AND 255),
  source_snapshot_id text NOT NULL CHECK (octet_length(source_snapshot_id) BETWEEN 1 AND 4096),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  mapping_sha256 text NOT NULL CHECK (mapping_sha256 ~ '^sha256:[0-9a-f]{64}$'),
  original_manifest jsonb NOT NULL CHECK (jsonb_typeof(original_manifest) = 'object'),
  imported_by text NOT NULL CHECK (octet_length(imported_by) BETWEEN 1 AND 63),
  imported_at timestamptz NOT NULL CHECK (isfinite(imported_at)),
  receipt jsonb NOT NULL CHECK (jsonb_typeof(receipt) = 'object')
);
ALTER TABLE offline.sync_import_receipts OWNER TO stynx_owner;
ALTER TABLE offline.sync_import_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_import_receipts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON offline.sync_import_receipts FROM PUBLIC, stynx_app, stynx_reader;

CREATE FUNCTION offline.guard_sync_import_receipt() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'STY50', MESSAGE = 'Offline import receipts are append-only.';
END
$guard$;
ALTER FUNCTION offline.guard_sync_import_receipt() OWNER TO stynx_owner;
REVOKE ALL ON FUNCTION offline.guard_sync_import_receipt() FROM PUBLIC;
CREATE TRIGGER sync_import_receipts_append_only BEFORE UPDATE OR DELETE ON offline.sync_import_receipts
  FOR EACH ROW EXECUTE FUNCTION offline.guard_sync_import_receipt();

-- The marker is derived by independently verified owner import, never source/application input.
ALTER TABLE offline.sync_batches ADD COLUMN response_body_is_archived boolean NOT NULL DEFAULT false;
CREATE FUNCTION offline.guard_archived_sync_batch() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $guard$
DECLARE table_owner name;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.response_body_is_archived THEN
    IF TG_OP = 'DELETE' OR NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION USING ERRCODE = 'STY51', MESSAGE = 'Verified archived batch responses are immutable.';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.response_body_is_archived THEN
    SELECT pg_get_userbyid(c.relowner) INTO table_owner FROM pg_class c WHERE c.oid=TG_RELID;
    IF current_user <> table_owner THEN
      RAISE EXCEPTION USING ERRCODE = 'STY52', MESSAGE = 'Archived response admission requires the actual table owner.';
    END IF;
    IF NEW.status <> 'closed' OR NEW.response_status IS DISTINCT FROM 201
       OR NEW.response_body_bytes IS NULL OR NEW.lease_token IS NOT NULL OR NEW.lease_expires_at IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'STY53', MESSAGE = 'Verified archived response lifecycle is invalid.';
    END IF;
  END IF;
  RETURN NEW;
END
$guard$;
ALTER FUNCTION offline.guard_archived_sync_batch() OWNER TO stynx_owner;
REVOKE ALL ON FUNCTION offline.guard_archived_sync_batch() FROM PUBLIC;
CREATE TRIGGER sync_batches_archive_guard BEFORE INSERT OR UPDATE OR DELETE ON offline.sync_batches
  FOR EACH ROW EXECUTE FUNCTION offline.guard_archived_sync_batch();
