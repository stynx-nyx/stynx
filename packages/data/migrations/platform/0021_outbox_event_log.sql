-- CTG9: additive event log, delivery projection and audit-chain serialization.
CREATE SEQUENCE outbox.event_order_seq AS bigint NO CYCLE CACHE 1;
CREATE TABLE outbox.legacy_ownership (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  state text NOT NULL DEFAULT 'LEGACY' CHECK (state IN ('LEGACY','NEW')),
  generation bigint NOT NULL DEFAULT 0
);
INSERT INTO outbox.legacy_ownership (id) VALUES (true);
-- @no_soft_delete: a tenant's monotonic ordering clock is operational state.
CREATE TABLE outbox.tenant_clock (
  tenant_id uuid PRIMARY KEY REFERENCES tenancy.tenants(id),
  last_ms bigint NOT NULL DEFAULT 0
);
-- @no_soft_delete: the event log is append-only and never deleted.
CREATE TABLE outbox.events (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  entity text NOT NULL,
  entity_id text NOT NULL,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL,
  CONSTRAINT outbox_events_tenant_id_id UNIQUE (tenant_id,id),
  CONSTRAINT outbox_events_dedup UNIQUE (tenant_id,idempotency_key)
);
CREATE INDEX outbox_events_cursor ON outbox.events (tenant_id,created_at,id);
CREATE INDEX outbox_events_aggregate ON outbox.events (tenant_id,entity,entity_id,created_at,id);
CREATE OR REPLACE FUNCTION outbox.reject_event_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'outbox_event_immutable' USING ERRCODE='STY42';
END $$;
CREATE TRIGGER outbox_events_immutable BEFORE UPDATE OR DELETE ON outbox.events
FOR EACH ROW EXECUTE FUNCTION outbox.reject_event_mutation();
-- @no_soft_delete: delivery lifecycle is expressed by status and attempts.
CREATE TABLE outbox.event_delivery (
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  legacy_id uuid,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','SENT_UNRESOLVED','ERROR','ACKED')),
  attempts integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  next_attempt_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,event_id),
  FOREIGN KEY (tenant_id,event_id) REFERENCES outbox.events(tenant_id,id)
);
-- @no_soft_delete: attempts are append-only transport evidence.
CREATE TABLE outbox.event_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  attempt_ordinal integer NOT NULL,
  provider text,
  protocol text,
  request_bytes bytea,
  request_sha256 text,
  request_headers jsonb,
  response_bytes bytea,
  response_sha256 text,
  response_status integer,
  evidence_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  result text NOT NULL,
  error text,
  leased_at timestamptz,
  completed_at timestamptz,
  legacy_message_id uuid,
  legacy_state jsonb,
  FOREIGN KEY (tenant_id,event_id) REFERENCES outbox.events(tenant_id,id),
  UNIQUE (tenant_id,event_id,attempt_ordinal)
);
-- @no_soft_delete: acknowledgements are append-only delivery evidence.
CREATE TABLE outbox.event_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  status text NOT NULL,
  raw_body bytea,
  raw_sha256 text,
  identity_verified boolean NOT NULL,
  hmac_verified boolean NOT NULL,
  verification_source text NOT NULL DEFAULT 'unavailable',
  legacy_ack_id uuid,
  legacy_ack_message text,
  legacy_ack_time timestamptz,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id,event_id) REFERENCES outbox.events(tenant_id,id)
);
-- @no_soft_delete: the legacy mapping is a durable cutover record.
CREATE TABLE outbox.legacy_event_map (
  legacy_id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  generation bigint NOT NULL,
  FOREIGN KEY (tenant_id,event_id) REFERENCES outbox.events(tenant_id,id),
  UNIQUE (tenant_id,event_id)
);
CREATE TABLE outbox.ack_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_body bytea NOT NULL,
  raw_sha256 text NOT NULL,
  reason text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE outbox.messages ADD COLUMN migrated_event_id uuid;
ALTER TABLE outbox.messages ADD COLUMN cutover_generation bigint;
ALTER TABLE outbox.legacy_ownership ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.legacy_ownership FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox.tenant_clock ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.tenant_clock FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.events FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox.event_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.event_delivery FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox.event_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.event_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox.event_acks ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.event_acks FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox.legacy_event_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.legacy_event_map FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox.ack_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox.ack_quarantine FORCE ROW LEVEL SECURITY;
CREATE POLICY ownership_read ON outbox.legacy_ownership FOR SELECT TO stynx_app USING (true);
-- A locking SELECT also evaluates UPDATE RLS. Permit row visibility for
-- FOR SHARE, while WITH CHECK false rejects an app UPDATE of the marker.
CREATE POLICY ownership_lock ON outbox.legacy_ownership FOR UPDATE TO stynx_app
  USING (true) WITH CHECK (false);
CREATE POLICY clock_tenant ON outbox.tenant_clock TO stynx_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY events_tenant ON outbox.events TO stynx_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY delivery_tenant ON outbox.event_delivery TO stynx_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY attempts_tenant ON outbox.event_attempts TO stynx_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY acks_tenant ON outbox.event_acks TO stynx_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY map_tenant ON outbox.legacy_event_map TO stynx_app
  USING (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
-- 0018 sets broad default table privileges; narrow each new relation here.
REVOKE ALL ON outbox.legacy_ownership,outbox.tenant_clock,outbox.events,
  outbox.event_delivery,outbox.event_attempts,outbox.event_acks,
  outbox.legacy_event_map,outbox.ack_quarantine FROM stynx_app,stynx_reader;
-- PostgreSQL requires UPDATE privilege to acquire FOR SHARE; ownership_lock
-- exposes the row to locking reads but WITH CHECK false denies app mutations.
GRANT SELECT,UPDATE ON outbox.legacy_ownership TO stynx_app;
GRANT SELECT,INSERT,UPDATE ON outbox.tenant_clock TO stynx_app;
GRANT SELECT,INSERT ON outbox.events TO stynx_app;
GRANT SELECT,INSERT,UPDATE ON outbox.event_delivery TO stynx_app;
GRANT SELECT,INSERT ON outbox.event_attempts,outbox.event_acks TO stynx_app;
GRANT SELECT ON outbox.legacy_event_map TO stynx_app;
GRANT USAGE,SELECT ON SEQUENCE outbox.event_order_seq TO stynx_app;
REVOKE ALL ON outbox.ack_quarantine FROM PUBLIC,stynx_app,stynx_reader;

-- The head lookup must be performed after a tenant advisory is held, including
-- the first row of a chain. NULL is a dedicated chain and cannot be switched
-- within a transaction. The chosen timestamp drives both audit stores.
-- @security-definer-approved: platform-architects/CTG-0009
CREATE OR REPLACE FUNCTION audit.lock_chain(p_tenant_id uuid)
RETURNS TABLE (previous_hash text, chosen_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,audit
AS $$
DECLARE
  chain_key text := coalesce(p_tenant_id::text,'<null-tenant>');
  prior_key text := nullif(current_setting('stynx.audit_chain_key',true),'');
  prior_lock_timeout text := current_setting('lock_timeout');
  head_at timestamptz;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'audit_chain_requires_read_committed'
      USING ERRCODE = '40001', HINT = 'Use READ COMMITTED for audited writes';
  END IF;
  IF prior_key IS NOT NULL AND prior_key <> chain_key THEN
    RAISE EXCEPTION 'audit_chain_key_mismatch' USING ERRCODE = 'STY41';
  END IF;
  PERFORM set_config('stynx.audit_chain_key',chain_key,true);
  -- A reservation's bounded lock_timeout applies to the idempotency key,
  -- not to the tenant audit chain reached by its AFTER INSERT trigger.
  PERFORM set_config('lock_timeout','0',true);
  PERFORM pg_advisory_xact_lock(hashtextextended(chain_key,0));
  PERFORM set_config('lock_timeout',prior_lock_timeout,true);
  IF p_tenant_id IS NULL THEN
    SELECT e.row_hash,e.occurred_at INTO previous_hash,head_at
      FROM audit.events e WHERE e.tenancy_id IS NULL
      ORDER BY e.occurred_at DESC,e.event_id DESC LIMIT 1;
  ELSE
    SELECT e.row_hash,e.occurred_at INTO previous_hash,head_at
      FROM audit.events e WHERE e.tenancy_id = p_tenant_id
      ORDER BY e.occurred_at DESC,e.event_id DESC LIMIT 1;
  END IF;
  chosen_at := greatest(clock_timestamp(),head_at + interval '1 microsecond');
  PERFORM audit.ensure_monthly_partition(chosen_at);
  RETURN NEXT;
END $$;
CREATE INDEX audit_events_tenant_head ON audit.events (tenancy_id,occurred_at DESC,event_id DESC) WHERE tenancy_id IS NOT NULL;
CREATE INDEX audit_events_null_head ON audit.events (occurred_at DESC,event_id DESC) WHERE tenancy_id IS NULL;
REVOKE ALL ON FUNCTION audit.lock_chain(uuid) FROM PUBLIC,stynx_app,stynx_reader;

-- All three entry points share the same head lock and timestamp.
CREATE OR REPLACE FUNCTION audit.write(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_operation text,
  p_entity text,
  p_entity_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_ip_address text DEFAULT NULL,
  p_session_id text DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_pk jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  entity_schema text := split_part(COALESCE(p_entity, ''), '.', 1);
  entity_table text := split_part(COALESCE(p_entity, ''), '.', 2);
  v_previous_hash text;
  v_occurred_at timestamptz;
BEGIN
  SELECT previous_hash, chosen_at INTO v_previous_hash, v_occurred_at
    FROM audit.lock_chain(p_tenant_id);

  INSERT INTO audit.events (
    occurred_at,
    tenancy_id,
    actor_id,
    actor_role,
    operation,
    entity,
    entity_id,
    pk,
    metadata,
    ip_address,
    request_id,
    old_data,
    new_data,
    previous_hash
  )
  VALUES (
    v_occurred_at,
    p_tenant_id,
    p_actor_id,
    p_actor_role,
    p_operation,
    p_entity,
    p_entity_id,
    p_pk,
    COALESCE(p_metadata, '{}'::jsonb),
    p_ip_address,
    p_request_id,
    p_old_data,
    p_new_data,
    v_previous_hash
  );

  INSERT INTO audit.log (
    occurred_at,
    table_schema,
    table_name,
    row_id,
    operation,
    tenant_id,
    actor_id,
    request_id,
    session_id,
    tags,
    payload
  )
  VALUES (
    v_occurred_at,
    NULLIF(CASE WHEN entity_table = '' THEN NULL ELSE entity_schema END, ''),
    COALESCE(NULLIF(entity_table, ''), NULLIF(entity_schema, ''), 'unknown'),
    p_entity_id,
    p_operation,
    p_tenant_id,
    p_actor_id,
    p_request_id,
    p_session_id,
    jsonb_strip_nulls(jsonb_build_object(
      'manual_event', true,
      'actor_role', p_actor_role
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'metadata', COALESCE(p_metadata, '{}'::jsonb),
      'ip_address', p_ip_address,
      'pk', p_pk,
      'old', p_old_data,
      'new', p_new_data
    ))
  );
END
$$;
-- @security-definer-approved: platform-architects/STYNX-AUDIT-DML
CREATE OR REPLACE FUNCTION audit.fn_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, public, pg_catalog, pg_temp
AS $$
DECLARE
  archive_move text := NULLIF(current_setting('app.archive_move', true), '');
  archive_reason text := NULLIF(current_setting('app.archive_reason', true), '');
  erasure_strategy text := COALESCE(
    NULLIF(current_setting('app.erasure_strategy', true), ''),
    NULLIF(current_setting('app.lgpd_strategy', true), '')
  );
  current_tags jsonb := '{}'::jsonb;
  current_payload jsonb;
  current_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  current_new jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  current_row jsonb := COALESCE(current_new, current_old, '{}'::jsonb);
  v_tenant_id uuid := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  v_actor_id uuid := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  v_request_id text := NULLIF(current_setting('app.request_id', true), '');
  v_session_id text := NULLIF(current_setting('app.session_id', true), '');
  v_previous_hash text;
  v_occurred_at timestamptz;
  current_row_id text := COALESCE(
    current_row ->> 'id',
    current_row ->> 'tenant_id',
    current_row ->> 'document_id',
    md5(current_row::text)
  );
  archive_table_name text := format('archive.%s_%s', TG_TABLE_SCHEMA, TG_TABLE_NAME);
BEGIN
  IF archive_move = 'in_progress'
     AND TG_TABLE_SCHEMA = 'archive'
     AND TG_OP = 'INSERT'
     AND archive_reason = 'soft_delete' THEN
    RETURN NEW;
  END IF;

  IF archive_move = 'in_progress'
     AND TG_TABLE_SCHEMA = 'archive'
     AND TG_OP = 'DELETE'
     AND archive_reason = 'restore' THEN
    RETURN NEW;
  END IF;

  IF erasure_strategy IS NOT NULL THEN
    current_tags := jsonb_build_object(
      'lgpd_erasure', true,
      'strategy', erasure_strategy
    );
    IF TG_TABLE_SCHEMA = 'archive' THEN
      current_tags := current_tags || jsonb_build_object('from_archive', true);
    END IF;
  ELSIF archive_move = 'in_progress'
     AND TG_TABLE_SCHEMA <> 'archive'
     AND TG_OP = 'DELETE'
     AND archive_reason = 'soft_delete' THEN
    current_tags := jsonb_build_object(
      'soft_delete', true,
      'archived', true,
      'archive_table', archive_table_name
    );
  ELSIF archive_move = 'in_progress'
     AND TG_TABLE_SCHEMA <> 'archive'
     AND TG_OP = 'INSERT'
     AND archive_reason = 'restore' THEN
    current_tags := jsonb_build_object(
      'restore', true,
      'from_archive', true
    );
  ELSIF TG_TABLE_SCHEMA <> 'archive'
     AND TG_OP = 'DELETE' THEN
    current_tags := jsonb_build_object('hard_delete', true);
  ELSIF TG_TABLE_SCHEMA = 'archive'
     AND TG_OP = 'DELETE' THEN
    current_tags := jsonb_build_object('hard_delete', true, 'from_archive', true);
  END IF;

  current_payload := jsonb_strip_nulls(
    jsonb_build_object(
      'archive_reason', archive_reason,
      'old', current_old,
      'new', current_new
    )
  );

  SELECT previous_hash, chosen_at INTO v_previous_hash, v_occurred_at
    FROM audit.lock_chain(v_tenant_id);

  INSERT INTO audit.events (
    occurred_at,
    tenancy_id,
    actor_id,
    operation,
    entity,
    entity_id,
    pk,
    request_id,
    metadata,
    old_data,
    new_data,
    previous_hash
  )
  VALUES (
    v_occurred_at,
    v_tenant_id,
    v_actor_id,
    TG_OP,
    TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
    current_row_id,
    jsonb_build_object('row_id', current_row_id),
    v_request_id,
    current_tags,
    current_old,
    current_new,
    v_previous_hash
  );

  INSERT INTO audit.log (
    occurred_at,
    table_schema,
    table_name,
    row_id,
    operation,
    tenant_id,
    actor_id,
    request_id,
    session_id,
    tags,
    payload
  )
  VALUES (
    v_occurred_at,
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    current_row_id,
    TG_OP,
    v_tenant_id,
    v_actor_id,
    v_request_id,
    v_session_id,
    current_tags,
    current_payload
  );

  RETURN COALESCE(NEW, OLD);
END
$$;
-- @security-definer-approved: platform-architects/CTG-0009
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

CREATE OR REPLACE FUNCTION outbox.event_uuid(p_ms bigint,p_order bigint) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT (
    substr(lpad(to_hex(p_ms),12,'0'),1,8) || '-' ||
    substr(lpad(to_hex(p_ms),12,'0'),9,4) || '-' ||
    '7' || lpad(to_hex(p_order >> 62),3,'0') || '-' ||
    substr('89ab',((p_order >> 60) & 3)::integer + 1,1) ||
    substr(lpad(to_hex(p_order & 1152921504606846975),15,'0'),1,3) || '-' ||
    substr(lpad(to_hex(p_order & 1152921504606846975),15,'0'),4,12)
  )::uuid;
$$;

-- Keep legacy bytes intact. Epoch 0 is evaluated as historical evidence;
-- epoch 1 begins with a new anchor after the greatest legacy timestamp.
ALTER TABLE audit.events ADD COLUMN epoch_id bigint NOT NULL DEFAULT 0;
ALTER TABLE audit.events ALTER COLUMN epoch_id SET DEFAULT 1;
CREATE TABLE audit.chain_diagnostics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenancy_id uuid,
  event_id uuid NOT NULL,
  finding text NOT NULL CHECK (finding IN ('HASH_MISMATCH','BROKEN_LINK','TEMPORAL_MISORDER','FORK')),
  observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (event_id,finding)
);
CREATE TABLE audit.chain_epoch_seals (
  anchor_event_id uuid PRIMARY KEY REFERENCES audit.events(event_id),
  tenancy_id uuid,
  legacy_tip_event_id uuid,
  legacy_tip_hash text,
  legacy_max_at timestamptz NOT NULL,
  sealed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE audit.chain_diagnostics ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.chain_diagnostics FORCE ROW LEVEL SECURITY;
ALTER TABLE audit.chain_epoch_seals ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.chain_epoch_seals FORCE ROW LEVEL SECURITY;
CREATE POLICY chain_diagnostic_tenant ON audit.chain_diagnostics TO stynx_app
  USING (tenancy_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
CREATE POLICY chain_seal_tenant ON audit.chain_epoch_seals TO stynx_app
  USING (tenancy_id = nullif(current_setting('app.tenant_id',true),'')::uuid);
GRANT SELECT ON audit.chain_diagnostics,audit.chain_epoch_seals TO stynx_app;
CREATE INDEX audit_events_chain_hash ON audit.events (tenancy_id,row_hash);

WITH ordered AS (
  SELECT e.*,
         lag(e.row_hash) OVER (PARTITION BY e.tenancy_id ORDER BY e.occurred_at,e.event_id) AS chronological_predecessor,
         count(*) OVER (PARTITION BY e.tenancy_id,e.previous_hash) AS shared_predecessor,
         predecessor.occurred_at AS linked_predecessor_at
    FROM audit.events e
    LEFT JOIN LATERAL (
      SELECT p.occurred_at FROM audit.events p
       WHERE p.row_hash=e.previous_hash AND p.tenancy_id IS NOT DISTINCT FROM e.tenancy_id
       ORDER BY p.occurred_at,p.event_id LIMIT 1
    ) predecessor ON true
    WHERE e.epoch_id=0
), findings AS (
  SELECT tenancy_id,event_id,'HASH_MISMATCH'::text AS finding
    FROM ordered WHERE row_hash IS DISTINCT FROM audit.compute_event_hash(
      event_id,occurred_at,tenancy_id,actor_id,entity,entity_id,operation,old_data,new_data,previous_hash)
  UNION ALL
  SELECT tenancy_id,event_id,'BROKEN_LINK' FROM ordered
   WHERE previous_hash IS DISTINCT FROM chronological_predecessor
  UNION ALL
  SELECT tenancy_id,event_id,'TEMPORAL_MISORDER' FROM ordered
   WHERE linked_predecessor_at IS NOT NULL AND linked_predecessor_at >= occurred_at
  UNION ALL
  SELECT tenancy_id,event_id,'FORK' FROM ordered
   WHERE previous_hash IS NOT NULL AND shared_predecessor > 1
)
INSERT INTO audit.chain_diagnostics (tenancy_id,event_id,finding)
SELECT tenancy_id,event_id,finding FROM findings ON CONFLICT DO NOTHING;

DO $$
DECLARE
  chain record;
  anchor_id uuid;
  anchor_at timestamptz;
BEGIN
  FOR chain IN
    SELECT DISTINCT ON (tenancy_id) tenancy_id,event_id,row_hash,
           max(occurred_at) OVER (PARTITION BY tenancy_id) AS max_at
      FROM audit.events WHERE epoch_id=0
     ORDER BY tenancy_id,occurred_at DESC,event_id DESC
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(chain.tenancy_id::text,'<null-tenant>'),0));
    anchor_at := greatest(clock_timestamp(),chain.max_at + interval '1 microsecond');
    PERFORM audit.ensure_monthly_partition(anchor_at);
    anchor_id := gen_random_uuid();
    INSERT INTO audit.events
      (event_id,occurred_at,tenancy_id,operation,entity,entity_id,metadata,previous_hash,epoch_id,row_hash)
    VALUES
      (anchor_id,anchor_at,chain.tenancy_id,'EPOCH_ANCHOR','audit.chain',
       coalesce(chain.tenancy_id::text,'<null-tenant>'),
       jsonb_build_object('legacy_tip_event_id',chain.event_id,'legacy_tip_hash',chain.row_hash),
       null,1,'');
    INSERT INTO audit.chain_epoch_seals
      (anchor_event_id,tenancy_id,legacy_tip_event_id,legacy_tip_hash,legacy_max_at)
    VALUES (anchor_id,chain.tenancy_id,chain.event_id,chain.row_hash,chain.max_at);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION audit.verify_chain(p_tenancy_id uuid,p_limit int DEFAULT 1000)
RETURNS TABLE (event_id uuid,occurred_at timestamptz,expected_hash text,stored_hash text,chain_valid boolean)
LANGUAGE sql STABLE AS $$
  WITH ordered AS (
    SELECT e.*,
           lag(e.row_hash) OVER (PARTITION BY e.epoch_id ORDER BY e.occurred_at,e.event_id) AS expected_previous_hash
      FROM audit.events e WHERE e.tenancy_id IS NOT DISTINCT FROM p_tenancy_id
  )
  SELECT o.event_id,o.occurred_at,
         audit.compute_event_hash(o.event_id,o.occurred_at,o.tenancy_id,o.actor_id,
           o.entity,o.entity_id,o.operation,o.old_data,o.new_data,o.previous_hash),
         o.row_hash,
         o.row_hash = audit.compute_event_hash(o.event_id,o.occurred_at,o.tenancy_id,o.actor_id,
           o.entity,o.entity_id,o.operation,o.old_data,o.new_data,o.previous_hash)
         AND o.previous_hash IS NOT DISTINCT FROM o.expected_previous_hash
    FROM ordered o ORDER BY o.occurred_at,o.event_id LIMIT p_limit;
$$;
CREATE OR REPLACE FUNCTION audit.verify_current_epoch(p_tenancy_id uuid,p_limit int DEFAULT 1000)
RETURNS TABLE (event_id uuid,occurred_at timestamptz,expected_hash text,stored_hash text,chain_valid boolean)
LANGUAGE sql STABLE AS $$
  WITH ordered AS (
    SELECT e.*,
           lag(e.row_hash) OVER (ORDER BY e.occurred_at,e.event_id) AS expected_previous_hash
      FROM audit.events e WHERE e.tenancy_id IS NOT DISTINCT FROM p_tenancy_id AND e.epoch_id=1
  )
  SELECT o.event_id,o.occurred_at,
         audit.compute_event_hash(o.event_id,o.occurred_at,o.tenancy_id,o.actor_id,
           o.entity,o.entity_id,o.operation,o.old_data,o.new_data,o.previous_hash),
         o.row_hash,
         o.row_hash = audit.compute_event_hash(o.event_id,o.occurred_at,o.tenancy_id,o.actor_id,
           o.entity,o.entity_id,o.operation,o.old_data,o.new_data,o.previous_hash)
         AND o.previous_hash IS NOT DISTINCT FROM o.expected_previous_hash
    FROM ordered o ORDER BY o.occurred_at,o.event_id LIMIT p_limit;
$$;
CREATE OR REPLACE FUNCTION audit.legacy_chain_diagnostics(p_tenancy_id uuid)
RETURNS TABLE (event_id uuid,finding text,detail jsonb)
LANGUAGE sql STABLE AS $$
  SELECT d.event_id,d.finding,d.detail FROM audit.chain_diagnostics d
   WHERE d.tenancy_id IS NOT DISTINCT FROM p_tenancy_id ORDER BY d.id;
$$;
