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

  PERFORM audit.ensure_monthly_partition(clock_timestamp());

  SELECT row_hash
  INTO v_previous_hash
  FROM audit.events
  WHERE tenancy_id IS NOT DISTINCT FROM v_tenant_id
  ORDER BY occurred_at DESC, event_id DESC
  LIMIT 1
  FOR UPDATE;

  INSERT INTO audit.events (
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
    clock_timestamp(),
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
