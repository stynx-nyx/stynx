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
  created_at timestamptz NOT NULL DEFAULT now()
);

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
BEGIN
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
    new_data
  )
  VALUES (
    COALESCE(p_tenant, auth.current_tenant()),
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
    p_new
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
