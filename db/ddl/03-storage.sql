-- 03-storage.sql
-- Storage metadata registry for S3-backed objects shared across tenants.

DROP SCHEMA IF EXISTS storage CASCADE;
CREATE SCHEMA storage;
SET search_path TO storage, public;

CREATE TABLE storage.files (
  file_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenancy_id uuid NOT NULL,
  owner_id uuid REFERENCES auth.users(user_id),
  bucket text NOT NULL,
  object_key text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text,
  size_bytes bigint,
  checksum text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz
);

CREATE INDEX idx_storage_files_tenant ON storage.files (tenancy_id, created_at DESC);
CREATE INDEX idx_storage_files_owner ON storage.files (owner_id);

CREATE OR REPLACE FUNCTION storage.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trig_storage_files_touch
BEFORE UPDATE ON storage.files
FOR EACH ROW EXECUTE FUNCTION storage.touch_updated_at();

CREATE TRIGGER trig_storage_files_enforce_tenant
BEFORE INSERT ON storage.files
FOR EACH ROW EXECUTE FUNCTION auth.apply_tenant();

ALTER TABLE storage.files ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.files FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON storage.files;
CREATE POLICY tenant_scope ON storage.files
  USING (
    tenancy_id = auth.current_tenant()
    OR auth.has_role('platform:superadmin')
  )
  WITH CHECK (
    tenancy_id = auth.current_tenant()
    OR auth.has_role('platform:superadmin')
  );

RESET search_path;
