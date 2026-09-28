-- Forward-only CTG9 durable sync upgrade. Apply after 0001, before 1.5.0 code.
ALTER TABLE offline.sync_queue_items ADD COLUMN identity_mode text NOT NULL DEFAULT 'e6'
  CONSTRAINT sync_queue_items_identity_mode_check CHECK (identity_mode IN ('e6','ctg9'));
CREATE UNIQUE INDEX sync_queue_items_e6_hash_uq
  ON offline.sync_queue_items (tenant_id, payload_hash) WHERE identity_mode = 'e6';
ALTER TABLE offline.sync_queue_items DROP CONSTRAINT sync_queue_items_tenant_id_payload_hash_key;
ALTER TABLE offline.numbering_reservations DROP CONSTRAINT numbering_reservations_status_check;
ALTER TABLE offline.numbering_reservations ADD CONSTRAINT numbering_reservations_status_check
  CHECK (status IN ('reserved','consumed','expired','cancelled','blocked'));
ALTER TABLE offline.numbering_reservations ADD COLUMN audit_actor_id text;
ALTER TABLE offline.numbering_reservations ADD COLUMN settlement_action text;
ALTER TABLE offline.numbering_reservations ADD COLUMN settlement_reason text;
ALTER TABLE offline.numbering_reservations ADD COLUMN settlement_user_ref text;
ALTER TABLE offline.numbering_reservations ADD COLUMN settled_by text;
ALTER TABLE offline.sync_conflicts DROP CONSTRAINT sync_conflicts_resolution_check;
ALTER TABLE offline.sync_conflicts ADD CONSTRAINT sync_conflicts_resolution_check
  CHECK (resolution IS NULL OR resolution IN
    ('device-wins','server-wins','manual-review','accept_server','reject','retry_after_correction','manual_review'));
ALTER TABLE offline.sync_conflicts ADD COLUMN resolution_reason text;
ALTER TABLE offline.sync_conflicts ADD COLUMN resolution_user_ref text;

CREATE TABLE offline.sync_batches (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_batch_id text NOT NULL,
  org_unit_id text NOT NULL,
  agent_id text NOT NULL,
  batch_sequence bigint,
  context_hash text NOT NULL,
  declared_keys jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('open','closed','legacy_closed_unverified')),
  lease_token uuid,
  lease_generation bigint NOT NULL DEFAULT 0,
  lease_expires_at timestamptz,
  transport_key text,
  transport_fingerprint text,
  response_status integer,
  response_body_bytes bytea,
  response_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  PRIMARY KEY (tenant_id, device_id, device_batch_id),
  UNIQUE (tenant_id, device_id, batch_sequence)
);
CREATE INDEX sync_batches_tenant_status_idx ON offline.sync_batches (tenant_id,status,lease_expires_at);

CREATE TABLE offline.sync_batch_transport_keys (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  transport_key text NOT NULL,
  device_id text NOT NULL,
  device_batch_id text NOT NULL,
  transport_fingerprint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,transport_key),
  FOREIGN KEY (tenant_id,device_id,device_batch_id)
    REFERENCES offline.sync_batches (tenant_id,device_id,device_batch_id)
);
CREATE INDEX sync_batch_transport_keys_tenant_batch_idx
  ON offline.sync_batch_transport_keys (tenant_id,device_id,device_batch_id);

CREATE TABLE offline.sync_item_receipts (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  queue_item_id text NOT NULL,
  device_id text NOT NULL,
  device_batch_id text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('received','applied','conflict','rejected')),
  error_code text,
  context_json jsonb,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz,
  PRIMARY KEY (tenant_id,idempotency_key),
  FOREIGN KEY (tenant_id,device_id,device_batch_id)
    REFERENCES offline.sync_batches (tenant_id,device_id,device_batch_id)
);
CREATE INDEX sync_item_receipts_tenant_batch_idx
  ON offline.sync_item_receipts (tenant_id,device_id,device_batch_id);

CREATE TABLE offline.sync_item_attempts (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_batch_id text NOT NULL,
  queue_item_id text NOT NULL,
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('received','applied','conflict','rejected')),
  error_code text,
  context_json jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,device_id,device_batch_id,queue_item_id),
  FOREIGN KEY (tenant_id,device_id,device_batch_id)
    REFERENCES offline.sync_batches (tenant_id,device_id,device_batch_id)
);
CREATE INDEX sync_item_attempts_tenant_key_idx ON offline.sync_item_attempts (tenant_id,idempotency_key);

CREATE TABLE offline.numbering_consumption (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  reservation_id uuid NOT NULL,
  number bigint NOT NULL,
  status text NOT NULL CHECK (status IN ('available','claimed-locally','applied','blocked','expired')),
  server_entity_id text,
  finalized_at timestamptz,
  PRIMARY KEY (tenant_id,reservation_id,number),
  FOREIGN KEY (tenant_id,reservation_id)
    REFERENCES offline.numbering_reservations (tenant_id,id)
);
CREATE INDEX numbering_consumption_tenant_status_idx
  ON offline.numbering_consumption (tenant_id,status,reservation_id);

CREATE TABLE offline.sync_conflict_evidence (
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  conflict_id uuid NOT NULL,
  queue_item_id text NOT NULL,
  related_queue_item_id text,
  allowed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,conflict_id,queue_item_id),
  FOREIGN KEY (tenant_id,conflict_id) REFERENCES offline.sync_conflicts (tenant_id,id)
);
CREATE INDEX sync_conflict_evidence_tenant_item_idx
  ON offline.sync_conflict_evidence (tenant_id,queue_item_id);

INSERT INTO offline.sync_batches (
 tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status
)
SELECT tenant_id,device_id,device_batch_id,min(org_unit_id),min(agent_id),
       'legacy-unverified',jsonb_agg(idempotency_key ORDER BY idempotency_key),
       'legacy_closed_unverified'
FROM offline.sync_queue_items
GROUP BY tenant_id,device_id,device_batch_id;
INSERT INTO offline.sync_item_receipts (
 tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,received_at
)
SELECT tenant_id,idempotency_key,id,device_id,device_batch_id,payload_hash,status,received_at
FROM offline.sync_queue_items;

ALTER TABLE offline.sync_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.sync_batches FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE offline.sync_batch_transport_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_batch_transport_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.sync_batch_transport_keys FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE offline.sync_item_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_item_receipts FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.sync_item_receipts FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE offline.sync_item_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_item_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.sync_item_attempts FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE offline.numbering_consumption ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.numbering_consumption FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.numbering_consumption FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
ALTER TABLE offline.sync_conflict_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_conflict_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.sync_conflict_evidence FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON offline.sync_batches,offline.sync_batch_transport_keys,offline.sync_item_receipts,offline.sync_item_attempts,offline.numbering_consumption,offline.sync_conflict_evidence FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE,DELETE ON offline.sync_batches,offline.sync_batch_transport_keys,offline.sync_item_receipts,offline.sync_item_attempts,offline.numbering_consumption,offline.sync_conflict_evidence TO stynx_app;
GRANT SELECT ON offline.sync_batches,offline.sync_batch_transport_keys,offline.sync_item_receipts,offline.sync_item_attempts,offline.numbering_consumption,offline.sync_conflict_evidence TO stynx_reader;
