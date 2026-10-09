-- Forward-only ADR-MOBILE-OFFLINE-0003 D1/D2 upgrade (UPS-OFS-06, UPS-OFS-07). Apply after 0003.
-- PostgreSQL cannot alter a CHECK in place: each status constraint below is dropped and re-added
-- by name with the same value set plus 'pending'. No row is deleted, rewritten or re-statused;
-- existing rows satisfy the widened constraint. The three tables keep their 0001/0002 FORCE RLS
-- policies, indexes and grants.
ALTER TABLE offline.sync_queue_items DROP CONSTRAINT sync_queue_items_status_check;
ALTER TABLE offline.sync_queue_items ADD CONSTRAINT sync_queue_items_status_check
  CHECK (status IN ('received','applied','conflict','rejected','pending'));
ALTER TABLE offline.sync_item_receipts DROP CONSTRAINT sync_item_receipts_status_check;
ALTER TABLE offline.sync_item_receipts ADD CONSTRAINT sync_item_receipts_status_check
  CHECK (status IN ('received','applied','conflict','rejected','pending'));
ALTER TABLE offline.sync_item_attempts DROP CONSTRAINT sync_item_attempts_status_check;
ALTER TABLE offline.sync_item_attempts ADD CONSTRAINT sync_item_attempts_status_check
  CHECK (status IN ('received','applied','conflict','rejected','pending'));

-- Append-only conflict action history (D2): every accepted resolution action, final or not.
-- The application role may read and append; rows are never updated or deleted.
CREATE TABLE offline.sync_conflict_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,
  conflict_id uuid NOT NULL,
  action text NOT NULL CHECK (octet_length(action) BETWEEN 1 AND 100),
  reason text CHECK (reason IS NULL OR octet_length(reason) <= 4000),
  user_ref text CHECK (user_ref IS NULL OR octet_length(user_ref) <= 255),
  actor_id text NOT NULL CHECK (octet_length(actor_id) BETWEEN 1 AND 255),
  resulting_status text NOT NULL CHECK (resulting_status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, conflict_id) REFERENCES offline.sync_conflicts (tenant_id, id)
);
CREATE INDEX sync_conflict_actions_tenant_conflict_idx
  ON offline.sync_conflict_actions (tenant_id, conflict_id, created_at);

ALTER TABLE offline.sync_conflict_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline.sync_conflict_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_tenant_isolation ON offline.sync_conflict_actions FOR ALL
  USING (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid);
REVOKE ALL ON offline.sync_conflict_actions FROM PUBLIC;
GRANT SELECT, INSERT ON offline.sync_conflict_actions TO stynx_app;
GRANT SELECT ON offline.sync_conflict_actions TO stynx_reader;
