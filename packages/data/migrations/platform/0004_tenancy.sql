CREATE TABLE IF NOT EXISTS tenancy.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS tenancy.tenant_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  timezone text,
  locale text,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE tenancy.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.tenant_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_isolation ON tenancy.tenants;
CREATE POLICY tenants_isolation ON tenancy.tenants
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tenant_settings_isolation ON tenancy.tenant_settings;
CREATE POLICY tenant_settings_isolation ON tenancy.tenant_settings
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
