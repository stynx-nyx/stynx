-- 02-audit.sql
-- Centralised auditing schema. Combines trigger-based logging from PORM
-- with explicit write() API used across PEC services.

DROP SCHEMA IF EXISTS audit CASCADE;
CREATE SCHEMA audit;
SET search_path TO audit, public;

CREATE TABLE audit.events (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  tenancy_id uuid,
  actor_id uuid,
  actor_role text,
  operation text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  pk jsonb,
  request_id text,
  ip_address text,
  station_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  old_data jsonb,
  new_data jsonb,
  previous_hash text,
  row_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION audit.format_hash_timestamp(p_occurred_at timestamptz)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(p_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00';
$$;

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
  SELECT
    encode(
      digest(
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

CREATE OR REPLACE FUNCTION audit.set_event_row_hash()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.row_hash := audit.compute_event_hash(
    NEW.event_id,
    NEW.occurred_at,
    NEW.tenancy_id,
    NEW.actor_id,
    NEW.entity,
    NEW.entity_id,
    NEW.operation,
    NEW.old_data,
    NEW.new_data,
    NEW.previous_hash
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER audit_events_set_row_hash
BEFORE INSERT ON audit.events
FOR EACH ROW EXECUTE FUNCTION audit.set_event_row_hash();

CREATE INDEX idx_audit_events_tenant_time ON audit.events (tenancy_id, occurred_at DESC);
CREATE INDEX idx_audit_events_entity ON audit.events (entity, entity_id);
CREATE INDEX idx_audit_events_operation ON audit.events (operation);
CREATE INDEX idx_audit_events_pk ON audit.events USING gin (pk);

CREATE OR REPLACE FUNCTION audit.write(
  p_tenant uuid,
  p_actor uuid,
  p_role text,
  p_operation text,
  p_entity text,
  p_entity_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip text DEFAULT NULL,
  p_station text DEFAULT NULL,
  p_request text DEFAULT NULL,
  p_old jsonb DEFAULT NULL,
  p_new jsonb DEFAULT NULL,
  p_pk jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := COALESCE(p_tenant, auth.current_tenant());
  v_previous_hash text;
BEGIN
  SELECT row_hash
  INTO v_previous_hash
  FROM audit.events
  WHERE tenancy_id IS NOT DISTINCT FROM v_tenant
  ORDER BY occurred_at DESC, event_id DESC
  LIMIT 1
  FOR UPDATE;

  INSERT INTO audit.events (
    tenancy_id,
    actor_id,
    actor_role,
    operation,
    entity,
    entity_id,
    pk,
    metadata,
    ip_address,
    station_id,
    request_id,
    old_data,
    new_data,
    previous_hash
  )
  VALUES (
    v_tenant,
    p_actor,
    p_role,
    p_operation,
    p_entity,
    p_entity_id,
    p_pk,
    COALESCE(p_metadata, '{}'::jsonb),
    p_ip,
    p_station,
    p_request,
    p_old,
    p_new,
    v_previous_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION audit.extract_primary_key(
  p_schema text,
  p_table text,
  p_row jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_key_columns text[];
  v_key text;
  v_pk jsonb := '{}'::jsonb;
BEGIN
  IF p_row IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_agg(att.attname ORDER BY key_pos.ord)
  INTO v_key_columns
  FROM pg_index idx
  JOIN pg_class cls ON cls.oid = idx.indrelid
  JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
  JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS key_pos(attnum, ord) ON true
  JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = key_pos.attnum
  WHERE idx.indisprimary
    AND nsp.nspname = p_schema
    AND cls.relname = p_table;

  IF v_key_columns IS NULL OR array_length(v_key_columns, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  FOREACH v_key IN ARRAY v_key_columns LOOP
    v_pk := v_pk || jsonb_build_object(v_key, p_row -> v_key);
  END LOOP;

  IF v_pk = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  RETURN v_pk;
END;
$$;

CREATE OR REPLACE FUNCTION audit.fn_log_dml()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_op text := TG_OP;
  v_tenant uuid := auth.current_tenant();
  v_actor uuid := auth.current_user_id();
  v_roles text[] := auth.current_roles();
  v_entity text := TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME;
  v_pk jsonb;
  v_entity_id text;
BEGIN
  IF v_op = 'INSERT' THEN
    v_pk := audit.extract_primary_key(TG_TABLE_SCHEMA, TG_TABLE_NAME, to_jsonb(NEW));
    v_entity_id := CASE WHEN v_pk ? 'id' THEN v_pk ->> 'id' ELSE NULL END;
    PERFORM audit.write(v_tenant, v_actor, v_roles[1], 'INSERT', v_entity, v_entity_id, to_jsonb(NEW), NULL, NULL, current_setting('stynx.correlation_id', true), NULL, to_jsonb(NEW), v_pk);
    RETURN NEW;
  ELSIF v_op = 'UPDATE' THEN
    v_pk := COALESCE(
      audit.extract_primary_key(TG_TABLE_SCHEMA, TG_TABLE_NAME, to_jsonb(NEW)),
      audit.extract_primary_key(TG_TABLE_SCHEMA, TG_TABLE_NAME, to_jsonb(OLD))
    );
    v_entity_id := CASE WHEN v_pk ? 'id' THEN v_pk ->> 'id' ELSE NULL END;
    PERFORM audit.write(v_tenant, v_actor, v_roles[1], 'UPDATE', v_entity, v_entity_id, to_jsonb(NEW), NULL, NULL, current_setting('stynx.correlation_id', true), to_jsonb(OLD), to_jsonb(NEW), v_pk);
    RETURN NEW;
  ELSIF v_op = 'DELETE' THEN
    v_pk := audit.extract_primary_key(TG_TABLE_SCHEMA, TG_TABLE_NAME, to_jsonb(OLD));
    v_entity_id := CASE WHEN v_pk ? 'id' THEN v_pk ->> 'id' ELSE NULL END;
    PERFORM audit.write(v_tenant, v_actor, v_roles[1], 'DELETE', v_entity, v_entity_id, '{}'::jsonb, NULL, NULL, current_setting('stynx.correlation_id', true), to_jsonb(OLD), NULL, v_pk);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION audit.attach_dml_triggers(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_reg regclass := format('%I.%I', p_schema, p_table)::regclass;
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS audit_log_dml ON %s', v_reg);
  EXECUTE format('CREATE TRIGGER audit_log_dml AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit.fn_log_dml()', v_reg);
END;
$$;

CREATE OR REPLACE FUNCTION audit.verify_chain(
  p_tenancy_id uuid,
  p_limit int DEFAULT 1000
)
RETURNS TABLE (
  event_id uuid,
  occurred_at timestamptz,
  expected_hash text,
  stored_hash text,
  chain_valid boolean
)
LANGUAGE sql
STABLE
AS $$
  WITH ordered AS (
    SELECT
      e.*,
      lag(e.row_hash) OVER (ORDER BY e.occurred_at, e.event_id) AS expected_previous_hash
    FROM audit.events e
    WHERE e.tenancy_id = p_tenancy_id
    ORDER BY e.occurred_at, e.event_id
    LIMIT p_limit
  )
  SELECT
    ordered.event_id,
    ordered.occurred_at,
    audit.compute_event_hash(
      ordered.event_id,
      ordered.occurred_at,
      ordered.tenancy_id,
      ordered.actor_id,
      ordered.entity,
      ordered.entity_id,
      ordered.operation,
      ordered.old_data,
      ordered.new_data,
      ordered.previous_hash
    ) AS expected_hash,
    ordered.row_hash AS stored_hash,
    ordered.row_hash = audit.compute_event_hash(
      ordered.event_id,
      ordered.occurred_at,
      ordered.tenancy_id,
      ordered.actor_id,
      ordered.entity,
      ordered.entity_id,
      ordered.operation,
      ordered.old_data,
      ordered.new_data,
      ordered.previous_hash
    )
    AND ordered.previous_hash IS NOT DISTINCT FROM ordered.expected_previous_hash AS chain_valid
  FROM ordered;
$$;

ALTER TABLE audit.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scope ON audit.events;
CREATE POLICY tenant_scope ON audit.events
  USING (
    tenancy_id = auth.current_tenant()
    OR auth.has_role('platform:superadmin')
    OR tenancy_id IS NULL
  );

RESET search_path;
