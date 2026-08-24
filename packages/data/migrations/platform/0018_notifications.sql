CREATE SCHEMA IF NOT EXISTS notifications AUTHORIZATION stynx_owner;
REVOKE ALL ON SCHEMA notifications FROM PUBLIC;
GRANT USAGE ON SCHEMA notifications TO stynx_owner, stynx_app, stynx_reader;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'notifications' AND t.typname = 'delivery_status') THEN
    CREATE TYPE notifications.delivery_status AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED');
  END IF;
END $$;

-- @no_soft_delete: delivery records are append-only operational evidence; status is terminal.
CREATE TABLE IF NOT EXISTS notifications.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  recipient_subject_id text NOT NULL,
  recipient_email text,
  recipient_phone text,
  recipient_push_token text,
  category text NOT NULL,
  template_id text NOT NULL,
  template_version integer NOT NULL CHECK (template_version > 0),
  locale text NOT NULL,
  variables jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_channels text[] NOT NULL,
  correlation_id text,
  created_by_actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, correlation_id),
  UNIQUE (tenant_id, id)
);

-- @no_soft_delete: a delivery is an immutable auditable attempt series.
CREATE TABLE IF NOT EXISTS notifications.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  notification_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'push', 'inapp')),
  status notifications.delivery_status NOT NULL DEFAULT 'QUEUED',
  suppressed_reason text,
  provider_message_id text,
  error_code text,
  error_detail text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  last_attempt_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT deliveries_notification_fkey FOREIGN KEY (tenant_id, notification_id)
    REFERENCES notifications.notifications(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, notification_id, channel),
  UNIQUE (tenant_id, id),
  CONSTRAINT deliveries_status_timestamps_ck CHECK (
    (status = 'QUEUED' AND delivered_at IS NULL AND failed_at IS NULL)
    OR (status = 'SENT' AND sent_at IS NOT NULL)
    OR (status = 'DELIVERED' AND delivered_at IS NOT NULL)
    OR (status = 'FAILED' AND failed_at IS NOT NULL)
    OR (status = 'SUPPRESSED' AND suppressed_reason IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS deliveries_due_idx ON notifications.deliveries (tenant_id, next_attempt_at)
  WHERE status = 'QUEUED';

CREATE TABLE IF NOT EXISTS notifications.inbox_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  recipient_subject_id text NOT NULL,
  notification_id uuid NOT NULL,
  delivery_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  locale text NOT NULL,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT inbox_notification_fkey FOREIGN KEY (tenant_id, notification_id)
    REFERENCES notifications.notifications(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT inbox_delivery_fkey FOREIGN KEY (tenant_id, delivery_id)
    REFERENCES notifications.deliveries(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, delivery_id)
);
CREATE INDEX IF NOT EXISTS inbox_recipient_idx ON notifications.inbox_items (tenant_id, recipient_subject_id, created_at DESC);

ALTER TABLE notifications.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.notifications FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.deliveries FORCE ROW LEVEL SECURITY;
ALTER TABLE notifications.inbox_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications.inbox_items FORCE ROW LEVEL SECURITY;

CREATE POLICY notifications_tenant_isolation ON notifications.notifications
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY deliveries_tenant_isolation ON notifications.deliveries
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY inbox_items_tenant_isolation ON notifications.inbox_items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA notifications TO stynx_app;
GRANT SELECT ON ALL TABLES IN SCHEMA notifications TO stynx_reader;
