-- @stynx-nyx/worklist — tenant-scoped work distribution.
-- Queue eligibility is derived from STYNX RBAC. worker_state stores only
-- availability, weight, and rotation state; it is never an authorization list.

CREATE SCHEMA IF NOT EXISTS worklist AUTHORIZATION stynx_owner;
REVOKE ALL ON SCHEMA worklist FROM PUBLIC;
GRANT USAGE ON SCHEMA worklist TO stynx_owner, stynx_app, stynx_reader;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'worklist' AND t.typname = 'item_status'
  ) THEN
    CREATE TYPE worklist.item_status AS ENUM ('pending', 'claimed', 'completed', 'canceled');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'worklist' AND t.typname = 'event_kind'
  ) THEN
    CREATE TYPE worklist.event_kind AS ENUM (
      'enqueue',
      'claim',
      'assign',
      'release',
      'complete',
      'cancel',
      'reassign',
      'override',
      'deadline_set',
      'deadline_breach'
    );
  END IF;
END
$$;

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE worklist.queues (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    code text NOT NULL,
    name text NOT NULL,
    description text,
    strategy text NOT NULL DEFAULT 'pull',
    strategy_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    required_permission text NOT NULL REFERENCES auth.perms(key),
    supervisor_permission text NOT NULL REFERENCES auth.perms(key),
    claim_limit integer,
    default_sla_seconds integer,
    default_sla_business_days integer,
    default_calendar_key text,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT queues_code_ck CHECK (btrim(code) <> ''),
    CONSTRAINT queues_strategy_ck CHECK (btrim(strategy) <> ''),
    CONSTRAINT queues_required_permission_ck CHECK (
      required_permission ~ '^[^:*[:space:]]+:[^:*[:space:]]+:[^:*[:space:]]+$'
    ),
    CONSTRAINT queues_supervisor_permission_ck CHECK (
      supervisor_permission ~ '^[^:*[:space:]]+:[^:*[:space:]]+:[^:*[:space:]]+$'
    ),
    CONSTRAINT queues_claim_limit_ck CHECK (claim_limit IS NULL OR claim_limit > 0),
    CONSTRAINT queues_default_sla_seconds_ck CHECK (
      default_sla_seconds IS NULL OR default_sla_seconds > 0
    ),
    CONSTRAINT queues_default_sla_business_days_ck CHECK (
      default_sla_business_days IS NULL OR default_sla_business_days > 0
    ),
    CONSTRAINT queues_sla_exclusive_ck CHECK (
      default_sla_seconds IS NULL OR default_sla_business_days IS NULL
    ),
    CONSTRAINT queues_calendar_key_ck CHECK (
      default_sla_business_days IS NOT NULL OR default_calendar_key IS NULL
    ),
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id)
  )
$ddl$);

-- worker_state is not a membership or ACL. Permission-bearing users without a
-- row are available with weight 1; a row cannot grant a permission.
SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE worklist.worker_state (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    queue_id uuid NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    is_available boolean NOT NULL DEFAULT true,
    weight numeric NOT NULL DEFAULT 1,
    last_assigned_at timestamptz,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT worker_state_queue_id_fkey
      FOREIGN KEY (tenant_id, queue_id)
      REFERENCES worklist.queues(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    CONSTRAINT worker_state_weight_ck CHECK (weight > 0),
    UNIQUE (tenant_id, queue_id, user_id),
    UNIQUE (tenant_id, id)
  )
$ddl$);

-- @no_soft_delete: operational items retire through an explicit status.
CREATE TABLE IF NOT EXISTS worklist.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  queue_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  status worklist.item_status NOT NULL DEFAULT 'pending',
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  deadline_kind text,
  deadline_business_days integer,
  deadline_calendar_key text,
  due_at timestamptz,
  breach_detected_at timestamptz,
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  canceled_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT items_queue_id_fkey
    FOREIGN KEY (tenant_id, queue_id)
    REFERENCES worklist.queues(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT items_entity_type_ck CHECK (btrim(entity_type) <> ''),
  CONSTRAINT items_entity_id_ck CHECK (btrim(entity_id) <> ''),
  CONSTRAINT items_deadline_kind_ck CHECK (
    deadline_kind IS NULL OR deadline_kind IN ('absolute', 'business_days')
  ),
  CONSTRAINT items_deadline_shape_ck CHECK (
    (deadline_kind IS NULL
      AND due_at IS NULL
      AND deadline_business_days IS NULL
      AND deadline_calendar_key IS NULL)
    OR
    (deadline_kind = 'absolute'
      AND due_at IS NOT NULL
      AND deadline_business_days IS NULL
      AND deadline_calendar_key IS NULL)
    OR
    (deadline_kind = 'business_days'
      AND due_at IS NOT NULL
      AND deadline_business_days > 0)
  ),
  UNIQUE (tenant_id, id)
);

-- @no_soft_delete: append-only operational evidence. Corrections are events.
CREATE TABLE IF NOT EXISTS worklist.item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  item_id uuid NOT NULL,
  kind worklist.event_kind NOT NULL,
  actor_id uuid,
  from_assignee uuid,
  to_assignee uuid,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT item_events_item_id_fkey
    FOREIGN KEY (tenant_id, item_id)
    REFERENCES worklist.items(tenant_id, id) ON DELETE CASCADE,
  UNIQUE (tenant_id, id)
);

ALTER TABLE worklist.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE worklist.items FORCE ROW LEVEL SECURITY;
ALTER TABLE worklist.item_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE worklist.item_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS items_tenant_isolation ON worklist.items;
CREATE POLICY items_tenant_isolation ON worklist.items
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS item_events_tenant_isolation ON worklist.item_events;
CREATE POLICY item_events_tenant_isolation ON worklist.item_events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE UNIQUE INDEX IF NOT EXISTS uq_worklist_items_open_entity
  ON worklist.items (tenant_id, queue_id, entity_type, entity_id)
  WHERE status IN ('pending', 'claimed');

CREATE INDEX IF NOT EXISTS idx_worklist_items_claim_order
  ON worklist.items (tenant_id, queue_id, priority, due_at, created_at, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_worklist_items_assignee_open
  ON worklist.items (tenant_id, queue_id, assignee_id)
  WHERE status = 'claimed';

CREATE INDEX IF NOT EXISTS idx_worklist_items_due_scan
  ON worklist.items (tenant_id, due_at, id)
  WHERE breach_detected_at IS NULL AND status IN ('pending', 'claimed');

CREATE INDEX IF NOT EXISTS idx_worklist_item_events_cursor
  ON worklist.item_events (tenant_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_worklist_item_events_item_created
  ON worklist.item_events (tenant_id, item_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_worklist_worker_state_rotation
  ON worklist.worker_state (tenant_id, queue_id, last_assigned_at, user_id)
  WHERE is_available;

CREATE OR REPLACE FUNCTION worklist.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION worklist.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.actor_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION worklist.prevent_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'worklist.item_events is append-only; append a corrective event instead';
END
$$;

DROP TRIGGER IF EXISTS trg_worklist_item_events_append_only ON worklist.item_events;
CREATE TRIGGER trg_worklist_item_events_append_only
BEFORE UPDATE OR DELETE ON worklist.item_events
FOR EACH ROW EXECUTE FUNCTION worklist.prevent_event_mutation();

CREATE OR REPLACE FUNCTION worklist.permission_pattern_matches(
  p_grant_key text,
  p_required_key text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT cardinality(parts.grant_parts) = 3
    AND cardinality(parts.required_parts) = 3
    AND NOT EXISTS (
      SELECT 1
      FROM generate_subscripts(parts.grant_parts, 1) AS index_value
      WHERE parts.grant_parts[index_value] <> '*'
        AND parts.grant_parts[index_value] <> parts.required_parts[index_value]
    )
  FROM (
    SELECT string_to_array(p_grant_key, ':') AS grant_parts,
      string_to_array(p_required_key, ':') AS required_parts
  ) AS parts;
$$;

-- Effective eligibility follows auth's grant sources and wildcard semantics.
-- worker_state is deliberately absent from this function.
CREATE OR REPLACE FUNCTION worklist.user_holds_permission(
  p_user uuid,
  p_required_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  WITH active_membership AS (
    SELECT membership.id
    FROM auth.memberships membership
    WHERE membership.tenant_id = worklist.current_tenant_id()
      AND membership.user_id = p_user
      AND membership.is_active
  ),
  grant_keys AS (
    SELECT permission.key
    FROM active_membership membership
    JOIN auth.direct_perms direct_perm ON direct_perm.membership_id = membership.id
    JOIN auth.perms permission ON permission.id = direct_perm.perm_id
    WHERE direct_perm.effect = 'allow'
    UNION
    SELECT permission.key
    FROM active_membership membership
    JOIN auth.membership_roles membership_role
      ON membership_role.membership_id = membership.id
    JOIN auth.role_perms role_perm ON role_perm.role_id = membership_role.role_id
    JOIN auth.perms permission ON permission.id = role_perm.perm_id
    UNION
    SELECT permission.key
    FROM active_membership membership
    JOIN auth.group_memberships group_membership
      ON group_membership.membership_id = membership.id
    JOIN auth.group_roles group_role ON group_role.group_id = group_membership.group_id
    JOIN auth.role_perms role_perm ON role_perm.role_id = group_role.role_id
    JOIN auth.perms permission ON permission.id = role_perm.perm_id
  )
  SELECT EXISTS (
    SELECT 1
    FROM grant_keys
    WHERE worklist.permission_pattern_matches(grant_keys.key, p_required_key)
  );
$$;

CREATE OR REPLACE FUNCTION worklist.open_claim_count(p_queue uuid, p_user uuid)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
  FROM worklist.items item
  WHERE item.queue_id = p_queue
    AND item.assignee_id = p_user
    AND item.status = 'claimed';
$$;

CREATE OR REPLACE FUNCTION worklist.eligible_workers(p_queue uuid)
RETURNS TABLE (
  user_id uuid,
  is_available boolean,
  weight numeric,
  last_assigned_at timestamptz,
  open_item_count integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT membership.user_id,
    COALESCE(worker.is_available, true) AS is_available,
    COALESCE(worker.weight, 1) AS weight,
    worker.last_assigned_at,
    worklist.open_claim_count(queue.id, membership.user_id) AS open_item_count
  FROM worklist.queues queue
  JOIN auth.memberships membership
    ON membership.tenant_id = queue.tenant_id
    AND membership.is_active
  LEFT JOIN worklist.worker_state worker
    ON worker.tenant_id = queue.tenant_id
    AND worker.queue_id = queue.id
    AND worker.user_id = membership.user_id
  WHERE queue.id = p_queue
    AND queue.tenant_id = worklist.current_tenant_id()
    AND worklist.user_holds_permission(membership.user_id, queue.required_permission)
    AND COALESCE(worker.is_available, true);
$$;

CREATE OR REPLACE FUNCTION worklist.assert_can_work(
  p_queue uuid,
  p_user uuid,
  p_ignore_availability boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_queue worklist.queues%ROWTYPE;
BEGIN
  SELECT * INTO v_queue
  FROM worklist.queues
  WHERE id = p_queue;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue not found' USING ERRCODE = 'WK404';
  END IF;
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'actor is required to work queue %', v_queue.code USING ERRCODE = 'WK403';
  END IF;
  IF NOT worklist.user_holds_permission(p_user, v_queue.required_permission) THEN
    RAISE EXCEPTION 'user does not hold permission % required by queue %',
      v_queue.required_permission, v_queue.code USING ERRCODE = 'WK403';
  END IF;
  IF NOT p_ignore_availability AND EXISTS (
    SELECT 1
    FROM worklist.worker_state worker
    WHERE worker.queue_id = p_queue
      AND worker.user_id = p_user
      AND NOT worker.is_available
  ) THEN
    RAISE EXCEPTION 'worker is unavailable in queue %', v_queue.code USING ERRCODE = 'WK403';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION worklist.assert_supervisor(p_queue uuid, p_actor uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_queue worklist.queues%ROWTYPE;
BEGIN
  SELECT * INTO v_queue FROM worklist.queues WHERE id = p_queue;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue not found' USING ERRCODE = 'WK404';
  END IF;
  IF p_actor IS NULL
    OR NOT worklist.user_holds_permission(p_actor, v_queue.supervisor_permission) THEN
    RAISE EXCEPTION 'actor does not hold supervisor permission % for queue %',
      v_queue.supervisor_permission, v_queue.code USING ERRCODE = 'WK403';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION worklist.assert_claim_capacity(p_queue uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit integer;
BEGIN
  SELECT claim_limit INTO v_limit FROM worklist.queues WHERE id = p_queue;
  IF v_limit IS NULL THEN
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_queue::text || ':' || p_user::text, 0));
  IF worklist.open_claim_count(p_queue, p_user) >= v_limit THEN
    RAISE EXCEPTION 'claim limit % reached for queue', v_limit USING ERRCODE = 'WK409';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION worklist.touch_worker_state(p_queue uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := worklist.current_tenant_id();
  v_actor uuid := worklist.current_actor_id();
BEGIN
  INSERT INTO worklist.worker_state (
    tenant_id, queue_id, user_id, is_available, weight,
    last_assigned_at, created_by, updated_by
  )
  VALUES (v_tenant, p_queue, p_user, true, 1, clock_timestamp(), v_actor, v_actor)
  ON CONFLICT (tenant_id, queue_id, user_id)
  DO UPDATE SET
    last_assigned_at = EXCLUDED.last_assigned_at,
    updated_at = clock_timestamp(),
    updated_by = v_actor;
END
$$;

CREATE OR REPLACE FUNCTION worklist.item_enqueue(
  p_queue_code text,
  p_entity_type text,
  p_entity_id text,
  p_priority integer DEFAULT NULL,
  p_due_at timestamptz DEFAULT NULL,
  p_deadline_kind text DEFAULT NULL,
  p_deadline_business_days integer DEFAULT NULL,
  p_deadline_calendar_key text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := worklist.current_tenant_id();
  v_actor uuid := worklist.current_actor_id();
  v_queue worklist.queues%ROWTYPE;
  v_due timestamptz := p_due_at;
  v_kind text := p_deadline_kind;
  v_business_days integer := p_deadline_business_days;
  v_calendar_key text := p_deadline_calendar_key;
  v_item uuid;
BEGIN
  IF v_tenant IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'app.tenant_id and app.actor_id are required' USING ERRCODE = 'WK403';
  END IF;
  IF p_entity_type IS NULL OR btrim(p_entity_type) = ''
    OR p_entity_id IS NULL OR btrim(p_entity_id) = '' THEN
    RAISE EXCEPTION 'entity type and id are required' USING ERRCODE = 'WK400';
  END IF;

  SELECT * INTO v_queue
  FROM worklist.queues
  WHERE tenant_id = v_tenant AND code = p_queue_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue % not found', p_queue_code USING ERRCODE = 'WK404';
  END IF;

  IF v_due IS NULL AND v_queue.default_sla_seconds IS NOT NULL THEN
    v_due := clock_timestamp() + make_interval(secs => v_queue.default_sla_seconds);
    v_kind := 'absolute';
  ELSIF v_due IS NULL AND v_queue.default_sla_business_days IS NOT NULL THEN
    RAISE EXCEPTION 'business calendar deadline must be resolved by the application'
      USING ERRCODE = 'WK400';
  END IF;

  INSERT INTO worklist.items (
    tenant_id, queue_id, entity_type, entity_id, priority,
    deadline_kind, deadline_business_days, deadline_calendar_key, due_at,
    payload, meta, created_by, updated_by
  )
  VALUES (
    v_tenant, v_queue.id, p_entity_type, p_entity_id, COALESCE(p_priority, 100),
    v_kind, v_business_days, v_calendar_key, v_due,
    COALESCE(p_payload, '{}'::jsonb), COALESCE(p_meta, '{}'::jsonb), v_actor, v_actor
  )
  RETURNING id INTO v_item;

  INSERT INTO worklist.item_events (tenant_id, item_id, kind, actor_id, payload)
  VALUES (
    v_tenant,
    v_item,
    'enqueue',
    v_actor,
    jsonb_build_object('entityType', p_entity_type, 'entityId', p_entity_id)
  );

  IF v_due IS NOT NULL THEN
    INSERT INTO worklist.item_events (tenant_id, item_id, kind, actor_id, payload)
    VALUES (
      v_tenant,
      v_item,
      'deadline_set',
      v_actor,
      jsonb_strip_nulls(jsonb_build_object(
        'kind', v_kind,
        'dueAt', v_due,
        'businessDays', v_business_days,
        'calendarKey', v_calendar_key
      ))
    );
  END IF;
  RETURN v_item;
END
$$;

CREATE OR REPLACE FUNCTION worklist.item_claim_next(
  p_queue uuid,
  p_user uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := worklist.current_tenant_id();
  v_actor uuid := worklist.current_actor_id();
  v_user uuid := COALESCE(p_user, worklist.current_actor_id());
  v_item uuid;
BEGIN
  PERFORM worklist.assert_can_work(p_queue, v_user);
  PERFORM worklist.assert_claim_capacity(p_queue, v_user);

  WITH next_item AS (
    SELECT item.id
    FROM worklist.items item
    WHERE item.tenant_id = v_tenant
      AND item.queue_id = p_queue
      AND item.status = 'pending'
    ORDER BY item.priority ASC,
      item.due_at ASC NULLS LAST,
      item.created_at ASC,
      item.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE worklist.items item
  SET status = 'claimed',
    assignee_id = v_user,
    claimed_at = clock_timestamp(),
    updated_at = clock_timestamp(),
    updated_by = v_actor
  FROM next_item
  WHERE item.id = next_item.id
  RETURNING item.id INTO v_item;

  IF v_item IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM worklist.touch_worker_state(p_queue, v_user);
  INSERT INTO worklist.item_events (tenant_id, item_id, kind, actor_id, to_assignee)
  VALUES (v_tenant, v_item, 'claim', v_actor, v_user);
  RETURN v_item;
END
$$;

CREATE OR REPLACE FUNCTION worklist.item_claim(p_item uuid, p_user uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := worklist.current_actor_id();
  v_user uuid := COALESCE(p_user, worklist.current_actor_id());
  v_row worklist.items%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM worklist.items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'WK404';
  END IF;
  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'item is not pending' USING ERRCODE = 'WK409';
  END IF;
  PERFORM worklist.assert_can_work(v_row.queue_id, v_user);
  PERFORM worklist.assert_claim_capacity(v_row.queue_id, v_user);

  UPDATE worklist.items
  SET status = 'claimed', assignee_id = v_user,
    claimed_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = v_actor
  WHERE id = p_item;
  PERFORM worklist.touch_worker_state(v_row.queue_id, v_user);
  INSERT INTO worklist.item_events (tenant_id, item_id, kind, actor_id, to_assignee)
  VALUES (v_row.tenant_id, p_item, 'claim', v_actor, v_user);
END
$$;

CREATE OR REPLACE FUNCTION worklist.item_release(
  p_item uuid,
  p_reason text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := worklist.current_actor_id();
  v_row worklist.items%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM worklist.items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'WK404';
  END IF;
  IF v_row.status <> 'claimed' THEN
    RAISE EXCEPTION 'item is not claimed' USING ERRCODE = 'WK409';
  END IF;
  IF p_force THEN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
      RAISE EXCEPTION 'supervisor override reason is required' USING ERRCODE = 'WK400';
    END IF;
    PERFORM worklist.assert_supervisor(v_row.queue_id, v_actor);
  ELSIF v_row.assignee_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the current assignee may release the item' USING ERRCODE = 'WK403';
  END IF;

  UPDATE worklist.items
  SET status = 'pending', assignee_id = NULL, claimed_at = NULL,
    updated_at = clock_timestamp(), updated_by = v_actor
  WHERE id = p_item;
  INSERT INTO worklist.item_events (
    tenant_id, item_id, kind, actor_id, from_assignee, reason, payload
  )
  VALUES (
    v_row.tenant_id,
    p_item,
    CASE WHEN p_force THEN 'override'::worklist.event_kind ELSE 'release'::worklist.event_kind END,
    v_actor,
    v_row.assignee_id,
    p_reason,
    CASE WHEN p_force THEN jsonb_build_object('operation', 'release') ELSE '{}'::jsonb END
  );
END
$$;

CREATE OR REPLACE FUNCTION worklist.item_complete(
  p_item uuid,
  p_note text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := worklist.current_actor_id();
  v_row worklist.items%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM worklist.items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'WK404';
  END IF;
  IF v_row.status = 'completed' THEN
    RETURN;
  END IF;
  IF v_row.status <> 'claimed' THEN
    RAISE EXCEPTION 'item is not claimed' USING ERRCODE = 'WK409';
  END IF;
  IF p_force THEN
    IF p_note IS NULL OR btrim(p_note) = '' THEN
      RAISE EXCEPTION 'supervisor override reason is required' USING ERRCODE = 'WK400';
    END IF;
    PERFORM worklist.assert_supervisor(v_row.queue_id, v_actor);
  ELSIF v_row.assignee_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the current assignee may complete the item' USING ERRCODE = 'WK403';
  END IF;

  UPDATE worklist.items
  SET status = 'completed', completed_at = clock_timestamp(),
    completed_by = COALESCE(v_actor, v_row.assignee_id),
    updated_at = clock_timestamp(), updated_by = v_actor
  WHERE id = p_item;
  INSERT INTO worklist.item_events (
    tenant_id, item_id, kind, actor_id, from_assignee, reason, payload
  )
  VALUES (
    v_row.tenant_id,
    p_item,
    CASE WHEN p_force THEN 'override'::worklist.event_kind ELSE 'complete'::worklist.event_kind END,
    v_actor,
    v_row.assignee_id,
    p_note,
    COALESCE(p_payload, '{}'::jsonb)
      || CASE WHEN p_force THEN jsonb_build_object('operation', 'complete') ELSE '{}'::jsonb END
  );
END
$$;

CREATE OR REPLACE FUNCTION worklist.item_cancel(p_item uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := worklist.current_actor_id();
  v_row worklist.items%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'cancel reason is required' USING ERRCODE = 'WK400';
  END IF;
  SELECT * INTO v_row FROM worklist.items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'WK404';
  END IF;
  IF v_row.status NOT IN ('pending', 'claimed') THEN
    RAISE EXCEPTION 'item is not open' USING ERRCODE = 'WK409';
  END IF;
  PERFORM worklist.assert_supervisor(v_row.queue_id, v_actor);
  UPDATE worklist.items
  SET status = 'canceled', canceled_at = clock_timestamp(),
    updated_at = clock_timestamp(), updated_by = v_actor
  WHERE id = p_item;
  INSERT INTO worklist.item_events (
    tenant_id, item_id, kind, actor_id, from_assignee, reason
  )
  VALUES (v_row.tenant_id, p_item, 'cancel', v_actor, v_row.assignee_id, p_reason);
END
$$;

CREATE OR REPLACE FUNCTION worklist.item_reassign(
  p_item uuid,
  p_to_user uuid,
  p_reason text,
  p_override boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := worklist.current_actor_id();
  v_row worklist.items%ROWTYPE;
BEGIN
  IF p_to_user IS NULL THEN
    RAISE EXCEPTION 'target user is required' USING ERRCODE = 'WK400';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'reassign reason is required' USING ERRCODE = 'WK400';
  END IF;
  SELECT * INTO v_row FROM worklist.items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'item not found' USING ERRCODE = 'WK404';
  END IF;
  IF v_row.status NOT IN ('pending', 'claimed') THEN
    RAISE EXCEPTION 'item is not open' USING ERRCODE = 'WK409';
  END IF;
  PERFORM worklist.assert_supervisor(v_row.queue_id, v_actor);
  PERFORM worklist.assert_can_work(v_row.queue_id, p_to_user, p_override);
  IF v_row.assignee_id IS DISTINCT FROM p_to_user THEN
    PERFORM worklist.assert_claim_capacity(v_row.queue_id, p_to_user);
  END IF;

  UPDATE worklist.items
  SET status = 'claimed', assignee_id = p_to_user,
    claimed_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = v_actor
  WHERE id = p_item;
  PERFORM worklist.touch_worker_state(v_row.queue_id, p_to_user);
  INSERT INTO worklist.item_events (
    tenant_id, item_id, kind, actor_id, from_assignee, to_assignee, reason, payload
  )
  VALUES (
    v_row.tenant_id,
    p_item,
    CASE WHEN p_override THEN 'override'::worklist.event_kind ELSE 'reassign'::worklist.event_kind END,
    v_actor,
    v_row.assignee_id,
    p_to_user,
    p_reason,
    CASE WHEN p_override THEN jsonb_build_object('operation', 'reassign') ELSE '{}'::jsonb END
  );
END
$$;

CREATE OR REPLACE FUNCTION worklist.item_assign_next(
  p_queue uuid,
  p_user uuid,
  p_strategy text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := worklist.current_tenant_id();
  v_actor uuid := worklist.current_actor_id();
  v_item uuid;
BEGIN
  PERFORM worklist.assert_can_work(p_queue, p_user);
  PERFORM worklist.assert_claim_capacity(p_queue, p_user);
  WITH next_item AS (
    SELECT item.id
    FROM worklist.items item
    WHERE item.tenant_id = v_tenant
      AND item.queue_id = p_queue
      AND item.status = 'pending'
    ORDER BY item.priority ASC,
      item.due_at ASC NULLS LAST,
      item.created_at ASC,
      item.id ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE worklist.items item
  SET status = 'claimed', assignee_id = p_user,
    claimed_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = v_actor
  FROM next_item
  WHERE item.id = next_item.id
  RETURNING item.id INTO v_item;
  IF v_item IS NULL THEN
    RETURN NULL;
  END IF;
  PERFORM worklist.touch_worker_state(p_queue, p_user);
  INSERT INTO worklist.item_events (
    tenant_id, item_id, kind, actor_id, to_assignee, payload
  )
  VALUES (
    v_tenant, v_item, 'assign', v_actor, p_user,
    jsonb_build_object('strategy', p_strategy)
  );
  RETURN v_item;
END
$$;

CREATE OR REPLACE FUNCTION worklist.assign_next(p_queue uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_queue worklist.queues%ROWTYPE;
  v_user uuid;
BEGIN
  SELECT * INTO v_queue FROM worklist.queues WHERE id = p_queue;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'queue not found' USING ERRCODE = 'WK404';
  END IF;
  IF v_queue.strategy NOT IN ('round_robin', 'load_balanced') THEN
    RAISE EXCEPTION 'queue strategy % does not use built-in push assignment',
      v_queue.strategy USING ERRCODE = 'WK409';
  END IF;

  -- Serialize worker selection per queue. Item selection itself remains
  -- SKIP LOCKED and does not serialize unrelated queues.
  PERFORM pg_advisory_xact_lock(hashtextextended('worklist:assign:' || p_queue::text, 0));
  IF v_queue.strategy = 'round_robin' THEN
    SELECT worker.user_id INTO v_user
    FROM worklist.eligible_workers(p_queue) worker
    WHERE v_queue.claim_limit IS NULL OR worker.open_item_count < v_queue.claim_limit
    ORDER BY worker.last_assigned_at ASC NULLS FIRST, worker.user_id ASC
    LIMIT 1;
  ELSE
    SELECT worker.user_id INTO v_user
    FROM worklist.eligible_workers(p_queue) worker
    WHERE v_queue.claim_limit IS NULL OR worker.open_item_count < v_queue.claim_limit
    ORDER BY worker.open_item_count::numeric / worker.weight ASC,
      worker.last_assigned_at ASC NULLS FIRST,
      worker.user_id ASC
    LIMIT 1;
  END IF;
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN worklist.item_assign_next(p_queue, v_user, v_queue.strategy);
END
$$;

CREATE OR REPLACE FUNCTION worklist.detect_breaches(p_limit integer DEFAULT 100)
RETURNS TABLE (
  event_id uuid,
  item_id uuid,
  tenant_id uuid,
  kind worklist.event_kind,
  actor_id uuid,
  from_assignee uuid,
  to_assignee uuid,
  reason text,
  payload jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := worklist.current_actor_id();
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'breach detection limit must be between 1 and 1000'
      USING ERRCODE = 'WK400';
  END IF;
  IF worklist.current_tenant_id() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'app.tenant_id and app.actor_id are required' USING ERRCODE = 'WK403';
  END IF;
  RETURN QUERY
  WITH breached AS (
    SELECT item.id, item.tenant_id, item.assignee_id, item.due_at,
      item.entity_type, item.entity_id
    FROM worklist.items item
    WHERE item.status IN ('pending', 'claimed')
      AND item.due_at IS NOT NULL
      AND item.due_at <= clock_timestamp()
      AND item.breach_detected_at IS NULL
    ORDER BY item.due_at ASC, item.id ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  flagged AS (
    UPDATE worklist.items item
    SET breach_detected_at = clock_timestamp(), updated_at = clock_timestamp(), updated_by = v_actor
    FROM breached
    WHERE item.id = breached.id
    RETURNING item.id, item.tenant_id, item.assignee_id, item.due_at,
      breached.entity_type, breached.entity_id
  ),
  recorded AS (
    INSERT INTO worklist.item_events (
      tenant_id, item_id, kind, actor_id, from_assignee, payload
    )
    SELECT flagged.tenant_id, flagged.id, 'deadline_breach', v_actor,
      flagged.assignee_id,
      jsonb_build_object(
        'dueAt', flagged.due_at,
        'entityType', flagged.entity_type,
        'entityId', flagged.entity_id
      )
    FROM flagged
    RETURNING id, worklist.item_events.item_id, worklist.item_events.tenant_id,
      worklist.item_events.kind, worklist.item_events.actor_id,
      worklist.item_events.from_assignee, worklist.item_events.to_assignee,
      worklist.item_events.reason, worklist.item_events.payload,
      worklist.item_events.created_at
  )
  SELECT recorded.id, recorded.item_id, recorded.tenant_id, recorded.kind,
    recorded.actor_id, recorded.from_assignee, recorded.to_assignee,
    recorded.reason, recorded.payload, recorded.created_at
  FROM recorded;
END
$$;

SELECT data.register_softdelete_fk(
  'worklist',
  'queues',
  'worklist',
  'worker_state',
  'worker_state_queue_id_fkey',
  'cascade'
);

SELECT audit.enable_for('worklist.queues'::regclass);
SELECT audit.enable_for('worklist.worker_state'::regclass);
SELECT audit.enable_for('worklist.items'::regclass);
SELECT audit.enable_for('worklist.item_events'::regclass);

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA worklist FROM PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA worklist TO stynx_app, stynx_reader;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA worklist TO stynx_app;
GRANT SELECT ON ALL TABLES IN SCHEMA worklist TO stynx_reader;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA worklist TO stynx_app, stynx_reader;

ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA worklist
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stynx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA worklist
  GRANT SELECT ON TABLES TO stynx_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA worklist
  GRANT USAGE, SELECT ON SEQUENCES TO stynx_app, stynx_reader;
