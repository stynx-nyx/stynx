-- @stynx-nyx/outbox — transactional outbox (E3), promoted from pec's
-- integration.renach_outbox / integration.renach_acks (see
-- database/ddl/03-integration.sql in the pec repo and
-- law/adr/ADR-OUTBOX-0001-transactional-outbox-promotion.md).
CREATE SCHEMA IF NOT EXISTS outbox AUTHORIZATION stynx_owner;
REVOKE ALL ON SCHEMA outbox FROM PUBLIC;
GRANT USAGE ON SCHEMA outbox TO stynx_owner, stynx_app, stynx_reader;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'outbox' AND t.typname = 'message_status'
  ) THEN
    CREATE TYPE outbox.message_status AS ENUM ('PENDING', 'SENT', 'ACKED', 'ERROR');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'outbox' AND t.typname = 'ack_status'
  ) THEN
    CREATE TYPE outbox.ack_status AS ENUM ('ACKED', 'ERROR');
  END IF;
END$$;

-- @no_soft_delete: outbox rows are operational (claimed/dispatched/acked in
-- place, not user data); lifecycle is expressed through `status`, not
-- deletion. Mirrors core.idempotency_keys / core.rate_limit_overrides.
CREATE TABLE IF NOT EXISTS outbox.messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,

  entity            text NOT NULL,
  entity_id         text NOT NULL,
  payload           jsonb NOT NULL,
  metadata          jsonb,

  status            outbox.message_status NOT NULL DEFAULT 'PENDING',
  attempts          integer NOT NULL DEFAULT 0,
  last_error        text,
  next_attempt_at   timestamptz,
  idempotency_key   text NOT NULL,
  ack_time          timestamptz,

  created_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at        timestamptz NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT uq_outbox_messages_entity UNIQUE (tenant_id, entity, entity_id),
  CONSTRAINT uq_outbox_messages_idempotency_key UNIQUE (tenant_id, idempotency_key)
);

-- Backs the cross-tenant claim query in OutboxService.dispatchDue()
-- (FOR UPDATE SKIP LOCKED over status + due time; not tenant-scoped, since
-- one scheduler sweep drains every tenant).
CREATE INDEX IF NOT EXISTS idx_outbox_messages_due
  ON outbox.messages (status, next_attempt_at);

-- @no_soft_delete: append-only ack ledger; superseded rows are never
-- overwritten (ON CONFLICT DO NOTHING on message_id dedupes webhook replay).
CREATE TABLE IF NOT EXISTS outbox.acknowledgements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE CASCADE,

  message_id    uuid NOT NULL REFERENCES outbox.messages(id) ON DELETE CASCADE,
  -- @softdelete_fk: hide would require a nullable FK; acknowledgements have
  -- no independent soft-delete/archive story (opted out above), so no
  -- @softdelete_fk annotation applies — the parent is also @no_soft_delete.

  ack_status    outbox.ack_status NOT NULL,
  ack_message   text,
  ack_time      timestamptz NOT NULL,

  created_at    timestamptz NOT NULL DEFAULT clock_timestamp(),

  CONSTRAINT uq_outbox_acknowledgements_message UNIQUE (message_id)
);

CREATE INDEX IF NOT EXISTS idx_outbox_acknowledgements_tenant
  ON outbox.acknowledgements (tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA outbox TO stynx_app;
GRANT SELECT ON ALL TABLES IN SCHEMA outbox TO stynx_reader;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA outbox TO stynx_app, stynx_reader;

ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA outbox
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stynx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA outbox
  GRANT SELECT ON TABLES TO stynx_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA outbox
  GRANT USAGE, SELECT ON SEQUENCES TO stynx_app, stynx_reader;

ALTER TABLE outbox.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.messages FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox.acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.acknowledgements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS outbox_messages_tenant_isolation ON outbox.messages;
CREATE POLICY outbox_messages_tenant_isolation ON outbox.messages
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS outbox_acknowledgements_tenant_isolation ON outbox.acknowledgements;
CREATE POLICY outbox_acknowledgements_tenant_isolation ON outbox.acknowledgements
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- `dispatchDue()`, `ack()`, and `retry()` run under `withSystemContext` +
-- `role: 'owner'` (see OutboxService) because they operate across tenants
-- (the scheduler sweep) or without an authenticated tenant context (inbound
-- webhook ACK) — the `stynx_owner` role bypasses RLS per platform
-- convention. `enqueue()` and `getOne()` run as `app`/`reader` under the
-- caller's own tenant context and stay RLS-scoped.
