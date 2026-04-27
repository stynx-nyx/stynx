-- @no_soft_delete: configuration rows are versioned through audit events.
CREATE TABLE IF NOT EXISTS core.config (
  key text PRIMARY KEY,
  tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- @no_soft_delete: rate-limit overrides are replaced in place and audited.
CREATE TABLE IF NOT EXISTS core.rate_limit_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  scope text NOT NULL,
  limit_value integer NOT NULL,
  window_seconds integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- @no_soft_delete: idempotency keys expire by retention window, not soft deletion.
CREATE TABLE IF NOT EXISTS core.idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  status text NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS core.schema_migrations (
  id text PRIMARY KEY,
  checksum text,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS core.softdelete_fk_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_schema text NOT NULL,
  parent_table text NOT NULL,
  child_schema text NOT NULL,
  child_table text NOT NULL,
  fk_constraint text NOT NULL,
  behavior text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (child_schema, child_table, fk_constraint)
);

CREATE TABLE IF NOT EXISTS core.pii_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_schema text NOT NULL,
  table_name text NOT NULL,
  column_name text NOT NULL,
  strategy text NOT NULL,
  category text,
  notes text,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (table_schema, table_name, column_name)
);

ALTER TABLE core.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.config FORCE ROW LEVEL SECURITY;
ALTER TABLE core.rate_limit_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.rate_limit_overrides FORCE ROW LEVEL SECURITY;
ALTER TABLE core.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.idempotency_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS config_tenant_isolation ON core.config;
CREATE POLICY config_tenant_isolation ON core.config
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR tenant_id IS NULL)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR tenant_id IS NULL);

DROP POLICY IF EXISTS rate_limit_overrides_tenant_isolation ON core.rate_limit_overrides;
CREATE POLICY rate_limit_overrides_tenant_isolation ON core.rate_limit_overrides
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR tenant_id IS NULL)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR tenant_id IS NULL);

DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON core.idempotency_keys;
CREATE POLICY idempotency_keys_tenant_isolation ON core.idempotency_keys
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR tenant_id IS NULL)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid OR tenant_id IS NULL);
