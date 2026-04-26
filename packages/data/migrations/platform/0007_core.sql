CREATE TABLE IF NOT EXISTS core.config (
  key text PRIMARY KEY,
  tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS core.rate_limit_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  scope text NOT NULL,
  limit_value integer NOT NULL,
  window_seconds integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

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
