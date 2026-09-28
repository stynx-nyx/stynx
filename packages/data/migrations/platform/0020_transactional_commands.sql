-- CTG-0005: additive durable command responses and an app-role audit entry point.
-- Legacy rows, including NULL-tenant keys, retain their original values.
ALTER TABLE core.idempotency_keys
  ADD COLUMN IF NOT EXISTS response_status integer,
  ADD COLUMN IF NOT EXISTS response_bytes bytea;

-- Transactional keys always have a tenant. Historical NULL-tenant keys remain
-- in storage, but application connections can neither read nor write them.
DROP POLICY IF EXISTS idempotency_keys_tenant_isolation ON core.idempotency_keys;
CREATE POLICY idempotency_keys_tenant_isolation ON core.idempotency_keys
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- audit.write is an invoker function: the app role must not execute it with
-- arbitrary tenant, actor or role arguments. The narrow definer entry point
-- below obtains identity only from the current transaction settings.
REVOKE ALL ON FUNCTION audit.write(
  uuid, uuid, text, text, text, text, jsonb, text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC, stynx_app;

-- The existing hash helper resolves pgcrypto's digest through the caller's
-- search_path. The restricted command wrapper deliberately omits public, where
-- 0002_extensions installs pgcrypto, so bind digest to its installed schema.
-- This preserves the historical hash bytes and the helper's signature.
CREATE OR REPLACE FUNCTION audit.compute_event_hash(
  p_event_id uuid,
  p_occurred_at timestamptz,
  p_tenancy_id uuid,
  p_actor_id uuid,
  p_entity text,
  p_entity_id text,
  p_operation text,
  p_old_data jsonb,
  p_new_data jsonb,
  p_previous_hash text
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT encode(
    public.digest(
      coalesce(p_event_id::text, '') || '|' ||
      coalesce(audit.format_hash_timestamp(p_occurred_at), '') || '|' ||
      coalesce(p_tenancy_id::text, '') || '|' ||
      coalesce(p_actor_id::text, '') || '|' ||
      coalesce(p_entity, '') || '|' ||
      coalesce(p_entity_id, '') || '|' ||
      coalesce(p_operation::text, '') || '|' ||
      coalesce(p_old_data::text, '') || '|' ||
      coalesce(p_new_data::text, '') || '|' ||
      coalesce(p_previous_hash, 'GENESIS'),
      'sha256'
    ),
    'hex'
  );
$$;

-- @security-definer-approved: platform-architects/CTG-0005
CREATE OR REPLACE FUNCTION audit.write_command_event(
  p_operation text,
  p_entity text,
  p_entity_id text,
  p_metadata jsonb,
  p_ip_address text,
  p_session_id text,
  p_request_id text,
  p_old_data jsonb,
  p_new_data jsonb,
  p_pk jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, audit
AS $$
DECLARE
  v_role text := NULLIF(current_setting('app.role', true), '');
  v_tenant text := NULLIF(current_setting('app.tenant_id', true), '');
  v_actor text := NULLIF(current_setting('app.actor_id', true), '');
  v_tenant_id uuid;
  v_actor_id uuid;
BEGIN
  IF v_role IS DISTINCT FROM 'app' OR v_tenant IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'App transaction with tenant and actor is required for command audit'
      USING ERRCODE = '42501';
  END IF;

  -- Cast after the nonempty check: malformed custom settings fail closed.
  v_tenant_id := v_tenant::uuid;
  v_actor_id := v_actor::uuid;
  IF p_operation IS NULL OR p_entity IS NULL
     OR btrim(p_operation) = '' OR btrim(p_entity) = ''
     OR (position('.' in p_entity) > 0
       AND (split_part(p_entity, '.', 1) = '' OR split_part(p_entity, '.', 2) = ''))
     OR length(p_operation) > 256 OR length(p_entity) > 256
     OR length(coalesce(p_entity_id, '')) > 1024
     OR length(coalesce(p_ip_address, '')) > 256
     OR length(coalesce(p_session_id, '')) > 1024
     OR length(coalesce(p_request_id, '')) > 1024
     OR pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 65536 THEN
    RAISE EXCEPTION 'Command audit event exceeds its bounded fields'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize each tenant's hash chain, including its first event. Owner has
  -- BYPASSRLS inside this function, so the setting-derived tenant is the only
  -- tenant passed to audit.write. Contention here is ordinary audit latency;
  -- it must never be translated into an idempotency reservation conflict.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_tenant_id::text, 0));
  -- audit.write records both audit.events and the NOT NULL audit.log schema.
  -- A bare logical entity is namespaced as command.<entity> for that pair.
  PERFORM audit.write(
    v_tenant_id, v_actor_id, v_role, p_operation,
    CASE WHEN position('.' in p_entity) > 0 THEN p_entity ELSE 'command.' || p_entity END,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb), p_ip_address, p_session_id,
    p_request_id, p_old_data, p_new_data, p_pk
  );
END
$$;

REVOKE ALL ON FUNCTION audit.write_command_event(
  text, text, text, jsonb, text, text, text, jsonb, jsonb, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.write_command_event(
  text, text, text, jsonb, text, text, text, jsonb, jsonb, jsonb
) TO stynx_app, stynx_owner;
