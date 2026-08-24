-- @stynx-nyx/offline-sync canonical PostgreSQL migration.
-- Tenant identity is set by @stynx-nyx/data as app.tenant_id for every request transaction.

CREATE SCHEMA IF NOT EXISTS offline AUTHORIZATION stynx_owner;
ALTER SCHEMA offline OWNER TO stynx_owner;

CREATE TABLE IF NOT EXISTS offline.numbering_ranges (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  org_unit_id text NOT NULL CHECK (octet_length(org_unit_id) BETWEEN 1 AND 255),
  entity_type text NOT NULL CHECK (octet_length(entity_type) BETWEEN 1 AND 100),
  series text NOT NULL CHECK (octet_length(series) BETWEEN 1 AND 80),
  start_number bigint NOT NULL,
  end_number bigint NOT NULL,
  next_number bigint NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'exhausted', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, org_unit_id, entity_type, series),
  CHECK (start_number <= next_number AND next_number <= end_number + 1)
);

CREATE INDEX IF NOT EXISTS numbering_ranges_tenant_status_idx
  ON offline.numbering_ranges (tenant_id, status, org_unit_id, entity_type);

CREATE TABLE IF NOT EXISTS offline.numbering_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  range_id uuid NOT NULL,
  org_unit_id text NOT NULL CHECK (octet_length(org_unit_id) BETWEEN 1 AND 255),
  entity_type text NOT NULL CHECK (octet_length(entity_type) BETWEEN 1 AND 100),
  series text NOT NULL CHECK (octet_length(series) BETWEEN 1 AND 80),
  agent_id text NOT NULL CHECK (octet_length(agent_id) BETWEEN 1 AND 255),
  device_id text NOT NULL CHECK (octet_length(device_id) BETWEEN 1 AND 255),
  shift_id text NOT NULL CHECK (octet_length(shift_id) BETWEEN 1 AND 255),
  start_number bigint NOT NULL,
  end_number bigint NOT NULL,
  next_number bigint NOT NULL,
  reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  valid_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'consumed', 'expired', 'cancelled')),
  cancellation_reason text CHECK (cancellation_reason IS NULL OR octet_length(cancellation_reason) <= 500),
  cancelled_by text CHECK (cancelled_by IS NULL OR octet_length(cancelled_by) <= 255),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, range_id)
    REFERENCES offline.numbering_ranges (tenant_id, id) ON DELETE RESTRICT,
  CHECK (start_number <= next_number AND next_number <= end_number + 1)
);

CREATE INDEX IF NOT EXISTS numbering_reservations_tenant_device_status_idx
  ON offline.numbering_reservations (tenant_id, device_id, status, valid_until);
CREATE INDEX IF NOT EXISTS numbering_reservations_tenant_range_idx
  ON offline.numbering_reservations (tenant_id, range_id, start_number, end_number);

CREATE TABLE IF NOT EXISTS offline.sync_queue_items (
  id text NOT NULL CHECK (octet_length(id) BETWEEN 1 AND 255),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  device_batch_id text NOT NULL CHECK (octet_length(device_batch_id) BETWEEN 1 AND 255),
  org_unit_id text NOT NULL CHECK (octet_length(org_unit_id) BETWEEN 1 AND 255),
  agent_id text NOT NULL CHECK (octet_length(agent_id) BETWEEN 1 AND 255),
  device_id text NOT NULL CHECK (octet_length(device_id) BETWEEN 1 AND 255),
  entity_type text NOT NULL CHECK (octet_length(entity_type) BETWEEN 1 AND 100),
  local_entity_id text NOT NULL CHECK (octet_length(local_entity_id) BETWEEN 1 AND 255),
  idempotency_key text NOT NULL CHECK (octet_length(idempotency_key) BETWEEN 1 AND 255),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  payload_json jsonb NOT NULL CHECK (jsonb_typeof(payload_json) = 'object'),
  reserved_number bigint,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'applied', 'conflict', 'rejected')),
  created_locally_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, payload_hash),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS sync_queue_items_tenant_device_status_idx
  ON offline.sync_queue_items (tenant_id, device_id, status, received_at);
CREATE INDEX IF NOT EXISTS sync_queue_items_tenant_batch_idx
  ON offline.sync_queue_items (tenant_id, device_batch_id, received_at);
CREATE INDEX IF NOT EXISTS sync_queue_items_tenant_entity_idx
  ON offline.sync_queue_items (tenant_id, entity_type, local_entity_id);

CREATE TABLE IF NOT EXISTS offline.sync_conflicts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  sync_queue_item_id text NOT NULL,
  local_entity_id text NOT NULL CHECK (octet_length(local_entity_id) BETWEEN 1 AND 255),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^sha256:[0-9a-f]{64}$'),
  conflict_type text NOT NULL CHECK (octet_length(conflict_type) BETWEEN 1 AND 100),
  description text NOT NULL CHECK (octet_length(description) BETWEEN 1 AND 4000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution text CHECK (
    resolution IS NULL OR resolution IN ('device-wins', 'server-wins', 'manual-review')
  ),
  resolved_by text CHECK (resolved_by IS NULL OR octet_length(resolved_by) <= 255),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  PRIMARY KEY (id),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, sync_queue_item_id)
    REFERENCES offline.sync_queue_items (tenant_id, id) ON DELETE CASCADE,
  CHECK (
    (status = 'open' AND resolution IS NULL AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolution IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS sync_conflicts_tenant_status_idx
  ON offline.sync_conflicts (tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS sync_conflicts_tenant_queue_idx
  ON offline.sync_conflicts (tenant_id, sync_queue_item_id);

ALTER TABLE offline.numbering_ranges ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.numbering_ranges FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offline_tenant_isolation ON offline.numbering_ranges;
CREATE POLICY offline_tenant_isolation ON offline.numbering_ranges
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE offline.numbering_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.numbering_reservations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offline_tenant_isolation ON offline.numbering_reservations;
CREATE POLICY offline_tenant_isolation ON offline.numbering_reservations
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE offline.sync_queue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_queue_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offline_tenant_isolation ON offline.sync_queue_items;
CREATE POLICY offline_tenant_isolation ON offline.sync_queue_items
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

ALTER TABLE offline.sync_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_conflicts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offline_tenant_isolation ON offline.sync_conflicts;
CREATE POLICY offline_tenant_isolation ON offline.sync_conflicts
  FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON SCHEMA offline FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA offline FROM PUBLIC;
GRANT USAGE ON SCHEMA offline TO stynx_app, stynx_reader;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA offline TO stynx_app;
GRANT SELECT ON ALL TABLES IN SCHEMA offline TO stynx_reader;
