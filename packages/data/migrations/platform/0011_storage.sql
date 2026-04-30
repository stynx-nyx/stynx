SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE storage.documents (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    collection text NOT NULL,
    s3_key text NOT NULL,
    filename text NOT NULL,
    mime_type text NOT NULL,
    byte_size bigint NOT NULL DEFAULT 0 CHECK (byte_size >= 0),
    checksum_sha256 text NOT NULL,
    scan_status text NOT NULL DEFAULT 'not_scanned'
      CHECK (scan_status IN ('not_scanned', 'completed', 'quarantined')),
    scan_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    encryption text NOT NULL DEFAULT 'aws:kms',
    classification text,
    owner_user_id uuid NOT NULL REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, s3_key)
  )
$ddl$);

-- @no_soft_delete: document versions are immutable metadata for a soft-deletable document.
CREATE TABLE IF NOT EXISTS storage.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  document_id uuid NOT NULL REFERENCES storage.documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  s3_version_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (document_id, version_number)
);

-- @no_soft_delete: ACL rows are replaced in place and audited.
CREATE TABLE IF NOT EXISTS storage.document_acl (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  document_id uuid NOT NULL REFERENCES storage.documents(id) ON DELETE CASCADE,
  subject_type text NOT NULL CHECK (subject_type IN ('user', 'group', 'role')),
  subject_id uuid NOT NULL,
  permission_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (document_id, subject_type, subject_id, permission_key)
);

ALTER TABLE storage.document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.document_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE storage.document_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.document_acl FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_versions_tenant_isolation ON storage.document_versions;
CREATE POLICY document_versions_tenant_isolation ON storage.document_versions
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS document_acl_tenant_isolation ON storage.document_acl;
CREATE POLICY document_acl_tenant_isolation ON storage.document_acl
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
