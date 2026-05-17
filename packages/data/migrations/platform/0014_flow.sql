CREATE SCHEMA IF NOT EXISTS flow AUTHORIZATION stynx_owner;
REVOKE ALL ON SCHEMA flow FROM PUBLIC;
GRANT USAGE ON SCHEMA flow TO stynx_owner, stynx_app, stynx_reader;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'node_kind'
  ) THEN
    CREATE TYPE flow.node_kind AS ENUM ('human', 'auto', 'system', 'start', 'end', 'gateway');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'decision_policy'
  ) THEN
    CREATE TYPE flow.decision_policy AS ENUM ('all', 'any', 'quorum');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'run_status'
  ) THEN
    CREATE TYPE flow.run_status AS ENUM ('active', 'completed', 'canceled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'node_run_status'
  ) THEN
    CREATE TYPE flow.node_run_status AS ENUM ('pending', 'in_progress', 'completed', 'canceled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'task_status'
  ) THEN
    CREATE TYPE flow.task_status AS ENUM ('open', 'completed', 'expired', 'canceled');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'agent_rule_type'
  ) THEN
    CREATE TYPE flow.agent_rule_type AS ENUM ('permission', 'user', 'resolver_fn');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'gating_mode'
  ) THEN
    CREATE TYPE flow.gating_mode AS ENUM ('all_required', 'any', 'threshold');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'field_type'
  ) THEN
    CREATE TYPE flow.field_type AS ENUM (
      'boolean',
      'string',
      'text',
      'number',
      'date',
      'select',
      'multiselect',
      'file',
      'url',
      'cnpj',
      'email'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'event_kind'
  ) THEN
    CREATE TYPE flow.event_kind AS ENUM (
      'run_create',
      'run_ensure',
      'node_open',
      'task_create',
      'task_done',
      'task_assign',
      'node_complete',
      'transition',
      'effect_requested',
      'run_complete',
      'run_cancel',
      'facts_changed',
      'signal_received',
      'task_accept',
      'task_decline',
      'task_withdraw',
      'task_unaccept'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'flow' AND t.typname = 'policy_effect'
  ) THEN
    CREATE TYPE flow.policy_effect AS ENUM ('allow', 'deny');
  END IF;
END
$$;

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.scopes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    code text NOT NULL,
    label text NOT NULL,
    adapter_key text NOT NULL,
    adapter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, code),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.graphs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    scope_id uuid NOT NULL,
    code text NOT NULL,
    version text NOT NULL DEFAULT 'v1',
    is_active boolean NOT NULL DEFAULT true,
    name text,
    description text,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT graphs_scope_id_fkey FOREIGN KEY (tenant_id, scope_id) REFERENCES flow.scopes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: block
    UNIQUE (tenant_id, scope_id, code, version),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.nodes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    graph_id uuid NOT NULL,
    code text NOT NULL,
    name text,
    kind flow.node_kind NOT NULL,
    decision_policy flow.decision_policy NOT NULL DEFAULT 'any',
    quorum_ratio numeric,
    allowed_actions text[] NOT NULL DEFAULT ARRAY['approve', 'reject']::text[],
    sla_seconds integer,
    entry_rule text,
    exit_rule text,
    sort_order integer NOT NULL DEFAULT 0,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT nodes_graph_id_fkey FOREIGN KEY (tenant_id, graph_id) REFERENCES flow.graphs(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    CONSTRAINT nodes_quorum_ratio_ck CHECK (quorum_ratio IS NULL OR (quorum_ratio >= 0 AND quorum_ratio <= 1)),
    UNIQUE (tenant_id, graph_id, code),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.edges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    graph_id uuid NOT NULL,
    from_node_id uuid NOT NULL,
    to_node_id uuid NOT NULL,
    action text,
    rule text,
    spawn boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT edges_graph_id_fkey FOREIGN KEY (tenant_id, graph_id) REFERENCES flow.graphs(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    CONSTRAINT edges_from_node_id_fkey FOREIGN KEY (tenant_id, from_node_id) REFERENCES flow.nodes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    CONSTRAINT edges_to_node_id_fkey FOREIGN KEY (tenant_id, to_node_id) REFERENCES flow.nodes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.agent_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    node_id uuid NOT NULL,
    rule_type flow.agent_rule_type NOT NULL,
    permission_key text,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    resolver_key text,
    params jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort_order integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT agent_rules_node_id_fkey FOREIGN KEY (tenant_id, node_id) REFERENCES flow.nodes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    CONSTRAINT agent_rules_shape_ck CHECK (
      (rule_type = 'permission' AND permission_key IS NOT NULL AND user_id IS NULL AND resolver_key IS NULL)
      OR (rule_type = 'user' AND user_id IS NOT NULL AND permission_key IS NULL AND resolver_key IS NULL)
      OR (rule_type = 'resolver_fn' AND resolver_key IS NOT NULL AND user_id IS NULL)
    ),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.transition_effects (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    graph_id uuid NOT NULL,
    node_code text,
    action text,
    effect_key text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort_order integer NOT NULL DEFAULT 0,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT transition_effects_graph_id_fkey FOREIGN KEY (tenant_id, graph_id) REFERENCES flow.graphs(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.policy_sets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    scope_id uuid NOT NULL,
    version text NOT NULL,
    is_active boolean NOT NULL DEFAULT false,
    name text,
    description text,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT policy_sets_scope_id_fkey FOREIGN KEY (tenant_id, scope_id) REFERENCES flow.scopes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    UNIQUE (tenant_id, scope_id, version),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.policy_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    policy_set_id uuid NOT NULL,
    node_code text,
    status_code text,
    action text,
    capability text,
    effect flow.policy_effect NOT NULL,
    priority integer NOT NULL DEFAULT 0,
    reason_code text,
    conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT policy_rules_policy_set_id_fkey FOREIGN KEY (tenant_id, policy_set_id) REFERENCES flow.policy_sets(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    CONSTRAINT policy_rules_target_ck CHECK (
      (action IS NOT NULL AND capability IS NULL)
      OR (action IS NULL AND capability IS NOT NULL)
    ),
    UNIQUE (tenant_id, id)
  )
$ddl$);

-- @no_soft_delete: runs are operational execution records and close by status transition.
CREATE TABLE IF NOT EXISTS flow.runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  scope_id uuid NOT NULL,
  graph_id uuid NOT NULL,
  adapter_key text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  status flow.run_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT runs_scope_id_fkey FOREIGN KEY (tenant_id, scope_id) REFERENCES flow.scopes(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT runs_graph_id_fkey FOREIGN KEY (tenant_id, graph_id) REFERENCES flow.graphs(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, graph_id, target_type, target_id),
  UNIQUE (tenant_id, id)
);

-- @no_soft_delete: node runs are operational execution records and close by status transition.
CREATE TABLE IF NOT EXISTS flow.node_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  run_id uuid NOT NULL,
  node_id uuid NOT NULL,
  status flow.node_run_status NOT NULL DEFAULT 'pending',
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  closed_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT node_runs_run_id_fkey FOREIGN KEY (tenant_id, run_id) REFERENCES flow.runs(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT node_runs_node_id_fkey FOREIGN KEY (tenant_id, node_id) REFERENCES flow.nodes(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id)
);

-- @no_soft_delete: tasks are operational work items and retire by status/timestamp transition.
CREATE TABLE IF NOT EXISTS flow.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  run_id uuid NOT NULL,
  node_run_id uuid NOT NULL,
  node_id uuid NOT NULL,
  assignee_type text NOT NULL DEFAULT 'unassigned'
    CHECK (assignee_type IN ('unassigned', 'user', 'permission', 'resolver')),
  assignee_id text,
  assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status flow.task_status NOT NULL DEFAULT 'open',
  allowed_actions text[] NOT NULL DEFAULT ARRAY['approve', 'reject']::text[],
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  decided_action text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  assigned_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  withdrawn_at timestamptz,
  retired_at timestamptz,
  due_at timestamptz,
  CONSTRAINT tasks_run_id_fkey FOREIGN KEY (tenant_id, run_id) REFERENCES flow.runs(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tasks_node_run_id_fkey FOREIGN KEY (tenant_id, node_run_id) REFERENCES flow.node_runs(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT tasks_node_id_fkey FOREIGN KEY (tenant_id, node_id) REFERENCES flow.nodes(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id)
);

-- @no_soft_delete: flow.events is an append-only workflow domain ledger; repair uses corrective events, not mutation.
CREATE TABLE IF NOT EXISTS flow.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
  run_id uuid NOT NULL,
  node_id uuid,
  task_id uuid,
  kind flow.event_kind NOT NULL,
  actor_id uuid,
  actor_label text,
  note text,
  facts jsonb,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT events_run_id_fkey FOREIGN KEY (tenant_id, run_id) REFERENCES flow.runs(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT events_node_id_fkey FOREIGN KEY (tenant_id, node_id) REFERENCES flow.nodes(tenant_id, id) ON DELETE SET NULL,
  CONSTRAINT events_task_id_fkey FOREIGN KEY (tenant_id, task_id) REFERENCES flow.tasks(tenant_id, id) ON DELETE SET NULL,
  UNIQUE (tenant_id, id)
);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.forms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    scope_id uuid NOT NULL,
    code text NOT NULL,
    version text NOT NULL DEFAULT 'v1',
    title text NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT forms_scope_id_fkey FOREIGN KEY (tenant_id, scope_id) REFERENCES flow.scopes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: block
    UNIQUE (tenant_id, scope_id, code, version),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.questions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    form_id uuid NOT NULL,
    key text NOT NULL,
    label text NOT NULL,
    field_type flow.field_type NOT NULL,
    required boolean NOT NULL DEFAULT false,
    blocks_submit boolean NOT NULL DEFAULT false,
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    validators jsonb NOT NULL DEFAULT '{}'::jsonb,
    visible_if jsonb NOT NULL DEFAULT '{}'::jsonb,
    sort_order integer NOT NULL DEFAULT 0,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT questions_form_id_fkey FOREIGN KEY (tenant_id, form_id) REFERENCES flow.forms(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    UNIQUE (tenant_id, form_id, key),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.scores (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    question_id uuid NOT NULL,
    pass_points numeric NOT NULL DEFAULT 1,
    fail_points numeric NOT NULL DEFAULT 0,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT scores_question_id_fkey FOREIGN KEY (tenant_id, question_id) REFERENCES flow.questions(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    UNIQUE (tenant_id, question_id),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.fills (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    form_id uuid NOT NULL,
    scope_id uuid NOT NULL,
    run_id uuid,
    node_run_id uuid,
    task_id uuid,
    target_type text NOT NULL,
    target_id text NOT NULL,
    status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'void')),
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT fills_form_id_fkey FOREIGN KEY (tenant_id, form_id) REFERENCES flow.forms(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: block
    CONSTRAINT fills_scope_id_fkey FOREIGN KEY (tenant_id, scope_id) REFERENCES flow.scopes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: block
    CONSTRAINT fills_run_id_fkey FOREIGN KEY (tenant_id, run_id) REFERENCES flow.runs(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fills_node_run_id_fkey FOREIGN KEY (tenant_id, node_run_id) REFERENCES flow.node_runs(tenant_id, id) ON DELETE SET NULL,
    CONSTRAINT fills_task_id_fkey FOREIGN KEY (tenant_id, task_id) REFERENCES flow.tasks(tenant_id, id) ON DELETE SET NULL,
    UNIQUE (tenant_id, form_id, target_type, target_id),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.answers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    fill_id uuid NOT NULL,
    question_id uuid NOT NULL,
    value jsonb,
    attachment jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT answers_fill_id_fkey FOREIGN KEY (tenant_id, fill_id) REFERENCES flow.fills(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    CONSTRAINT answers_question_id_fkey FOREIGN KEY (tenant_id, question_id) REFERENCES flow.questions(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: block
    UNIQUE (tenant_id, fill_id, question_id),
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.waivers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    scope_id uuid NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    form_id uuid NOT NULL,
    question_id uuid,
    reason text NOT NULL,
    waived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT waivers_scope_id_fkey FOREIGN KEY (tenant_id, scope_id) REFERENCES flow.scopes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: block
    CONSTRAINT waivers_form_id_fkey FOREIGN KEY (tenant_id, form_id) REFERENCES flow.forms(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: block
    CONSTRAINT waivers_question_id_fkey FOREIGN KEY (tenant_id, question_id) REFERENCES flow.questions(tenant_id, id) ON DELETE SET NULL, -- @softdelete_fk: hide
    UNIQUE (tenant_id, id)
  )
$ddl$);

SELECT data.create_soft_deletable_table($ddl$
  CREATE TABLE flow.node_form_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
    node_id uuid NOT NULL,
    form_id uuid NOT NULL,
    required boolean NOT NULL DEFAULT true,
    gating_mode flow.gating_mode NOT NULL DEFAULT 'all_required',
    threshold numeric,
    applicability jsonb NOT NULL DEFAULT '{}'::jsonb,
    weight numeric NOT NULL DEFAULT 1,
    meta jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT node_form_rules_node_id_fkey FOREIGN KEY (tenant_id, node_id) REFERENCES flow.nodes(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: cascade
    CONSTRAINT node_form_rules_form_id_fkey FOREIGN KEY (tenant_id, form_id) REFERENCES flow.forms(tenant_id, id) ON DELETE RESTRICT, -- @softdelete_fk: block
    UNIQUE (tenant_id, node_id, form_id),
    UNIQUE (tenant_id, id)
  )
$ddl$);

ALTER TABLE flow.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.runs FORCE ROW LEVEL SECURITY;
ALTER TABLE flow.node_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.node_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE flow.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE flow.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS runs_tenant_isolation ON flow.runs;
CREATE POLICY runs_tenant_isolation ON flow.runs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS node_runs_tenant_isolation ON flow.node_runs;
CREATE POLICY node_runs_tenant_isolation ON flow.node_runs
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS tasks_tenant_isolation ON flow.tasks;
CREATE POLICY tasks_tenant_isolation ON flow.tasks
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS events_tenant_isolation ON flow.events;
CREATE POLICY events_tenant_isolation ON flow.events
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

CREATE INDEX IF NOT EXISTS idx_flow_graphs_tenant_scope_code_version
  ON flow.graphs (tenant_id, scope_id, code, version);
CREATE INDEX IF NOT EXISTS idx_flow_nodes_graph_code
  ON flow.nodes (tenant_id, graph_id, code);
CREATE INDEX IF NOT EXISTS idx_flow_edges_graph_from_action
  ON flow.edges (tenant_id, graph_id, from_node_id, action, sort_order);
CREATE INDEX IF NOT EXISTS idx_flow_runs_tenant_scope_target_status
  ON flow.runs (tenant_id, scope_id, target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_tasks_tenant_assignee_status
  ON flow.tasks (tenant_id, assignee_user_id, assignee_type, assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_flow_events_run_created_at
  ON flow.events (tenant_id, run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_flow_fills_target_form
  ON flow.fills (tenant_id, target_type, target_id, form_id);
CREATE INDEX IF NOT EXISTS idx_flow_policy_sets_active
  ON flow.policy_sets (tenant_id, scope_id)
  WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_flow_policy_rules_action
  ON flow.policy_rules (tenant_id, policy_set_id, node_code, status_code, action)
  WHERE action IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_flow_policy_rules_capability
  ON flow.policy_rules (tenant_id, policy_set_id, node_code, status_code, capability)
  WHERE capability IS NOT NULL;

SELECT audit.enable_for('flow.runs'::regclass);
SELECT audit.enable_for('flow.node_runs'::regclass);
SELECT audit.enable_for('flow.tasks'::regclass);
SELECT audit.enable_for('flow.events'::regclass);

CREATE OR REPLACE FUNCTION flow.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION flow.current_actor_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.actor_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION flow.prevent_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'flow.events is append-only; append a corrective event instead';
END
$$;

DROP TRIGGER IF EXISTS trg_flow_events_append_only ON flow.events;
CREATE TRIGGER trg_flow_events_append_only
BEFORE UPDATE OR DELETE ON flow.events
FOR EACH ROW EXECUTE FUNCTION flow.prevent_event_mutation();

CREATE OR REPLACE FUNCTION flow.forms_facts(p_scope uuid, p_target_type text, p_target_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN (
    WITH forms_in_scope AS (
      SELECT f.id, f.code
      FROM flow.forms f
      WHERE f.scope_id = p_scope
        AND f.is_active
    ),
    inst AS (
      SELECT fi.id AS fill_id, fi.form_id, f.code
      FROM flow.fills fi
      JOIN flow.forms f ON f.id = fi.form_id
      WHERE fi.scope_id = p_scope
        AND fi.target_id = p_target_id
        AND (p_target_type IS NULL OR fi.target_type = p_target_type)
    ),
    question_rows AS (
      SELECT q.form_id, q.id AS question_id, q.key, q.required
      FROM flow.questions q
      JOIN forms_in_scope f ON f.id = q.form_id
    ),
    answered AS (
      SELECT a.fill_id, a.question_id
      FROM flow.answers a
    ),
    waived AS (
      SELECT w.form_id, w.question_id
      FROM flow.waivers w
      WHERE w.scope_id = p_scope
        AND w.target_id = p_target_id
        AND (p_target_type IS NULL OR w.target_type = p_target_type)
        AND (w.expires_at IS NULL OR w.expires_at > clock_timestamp())
    ),
    score_rows AS (
      SELECT q.form_id,
             SUM(
               CASE
                 WHEN EXISTS (
                   SELECT 1
                   FROM answered a
                   JOIN inst i ON i.fill_id = a.fill_id
                   WHERE a.question_id = q.question_id
                 )
                 OR EXISTS (
                   SELECT 1
                   FROM waived w
                   WHERE w.question_id = q.question_id
                     OR (w.question_id IS NULL AND w.form_id = q.form_id)
                 )
                 THEN COALESCE(s.pass_points, 1)
                 ELSE COALESCE(s.fail_points, 0)
               END
             ) AS total
      FROM question_rows q
      LEFT JOIN flow.scores s ON s.question_id = q.question_id
      GROUP BY q.form_id
    ),
    missing_rows AS (
      SELECT q.form_id, array_agg(q.key ORDER BY q.key) AS missing
      FROM question_rows q
      WHERE q.required
        AND NOT EXISTS (
          SELECT 1
          FROM answered a
          JOIN inst i ON i.fill_id = a.fill_id
          WHERE a.question_id = q.question_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM waived w
          WHERE w.question_id = q.question_id
            OR (w.question_id IS NULL AND w.form_id = q.form_id)
        )
      GROUP BY q.form_id
    ),
    pass_rows AS (
      SELECT q.form_id,
             bool_and(
               NOT q.required
               OR EXISTS (
                 SELECT 1
                 FROM answered a
                 JOIN inst i ON i.fill_id = a.fill_id
                 WHERE a.question_id = q.question_id
               )
               OR EXISTS (
                 SELECT 1
                 FROM waived w
                 WHERE w.question_id = q.question_id
                   OR (w.question_id IS NULL AND w.form_id = q.form_id)
               )
             ) AS pass
      FROM question_rows q
      GROUP BY q.form_id
    )
    SELECT jsonb_build_object(
      'byFormCode',
      COALESCE(
        jsonb_object_agg(
          f.code,
          jsonb_build_object(
            'autoPass', COALESCE(p.pass, true),
            'score', COALESCE(s.total, 0),
            'missing', COALESCE(to_jsonb(m.missing), '[]'::jsonb)
          )
        ),
        '{}'::jsonb
      ),
      'required',
      jsonb_build_object('allPass', COALESCE((SELECT bool_and(pass) FROM pass_rows), true))
    )
    FROM forms_in_scope f
    LEFT JOIN pass_rows p ON p.form_id = f.id
    LEFT JOIN score_rows s ON s.form_id = f.id
    LEFT JOIN missing_rows m ON m.form_id = f.id
  );
END
$$;

CREATE OR REPLACE FUNCTION flow.forms_facts(p_scope uuid, p_target uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT flow.forms_facts(p_scope, NULL::text, p_target::text);
$$;

CREATE OR REPLACE FUNCTION flow.build_facts(p_scope uuid, p_target_type text, p_target_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'scopeId', p_scope,
    'target', jsonb_build_object('type', p_target_type, 'id', p_target_id),
    'forms', flow.forms_facts(p_scope, p_target_type, p_target_id)
  );
$$;

CREATE OR REPLACE FUNCTION flow.build_facts(p_scope uuid, p_target uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT flow.build_facts(p_scope, NULL::text, p_target::text);
$$;

CREATE OR REPLACE FUNCTION flow.eval_rule(p_expr text, p_facts jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF p_expr IS NULL OR btrim(p_expr) = '' THEN
    RETURN true;
  END IF;

  RETURN COALESCE(jsonb_path_exists(COALESCE(p_facts, '{}'::jsonb), p_expr::jsonpath), false);
EXCEPTION WHEN others THEN
  RETURN false;
END
$$;

CREATE OR REPLACE FUNCTION flow.resolve_agents(p_node uuid, p_run uuid)
RETURNS TABLE(agent_type text, agent_id text, rule_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE rule.rule_type
      WHEN 'user' THEN 'user'
      WHEN 'permission' THEN 'permission'
      ELSE 'resolver'
    END AS agent_type,
    CASE rule.rule_type
      WHEN 'user' THEN rule.user_id::text
      WHEN 'permission' THEN rule.permission_key
      ELSE rule.resolver_key
    END AS agent_id,
    rule.id AS rule_id
  FROM flow.agent_rules rule
  JOIN flow.nodes node ON node.id = rule.node_id
  JOIN flow.runs run ON run.id = p_run AND run.graph_id = node.graph_id
  WHERE rule.node_id = p_node
    AND (
      (rule.rule_type = 'user' AND rule.user_id IS NOT NULL)
      OR (rule.rule_type = 'permission' AND rule.permission_key IS NOT NULL)
      OR (rule.rule_type = 'resolver_fn' AND rule.resolver_key IS NOT NULL)
    )
  ORDER BY rule.sort_order, rule.id;
$$;

CREATE OR REPLACE FUNCTION flow.run_ensure(
  p_graph_code text,
  p_version text,
  p_scope_code text,
  p_adapter_key text,
  p_target_type text,
  p_target_id text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := flow.current_tenant_id();
  v_actor uuid := flow.current_actor_id();
  v_graph flow.graphs%ROWTYPE;
  v_scope flow.scopes%ROWTYPE;
  v_run uuid;
  v_facts jsonb;
  v_start uuid;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'app.tenant_id is required';
  END IF;

  SELECT g.* INTO v_graph
  FROM flow.graphs g
  JOIN flow.scopes s ON s.id = g.scope_id
  WHERE g.tenant_id = v_tenant
    AND g.code = p_graph_code
    AND g.version = p_version
    AND s.code = p_scope_code
    AND (p_adapter_key IS NULL OR s.adapter_key = p_adapter_key)
    AND g.is_active
  ORDER BY g.updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'flow graph %.% for scope % not found', p_graph_code, p_version, p_scope_code;
  END IF;

  SELECT * INTO v_scope FROM flow.scopes WHERE id = v_graph.scope_id;

  INSERT INTO flow.runs (
    tenant_id,
    graph_id,
    scope_id,
    adapter_key,
    target_type,
    target_id,
    status,
    created_by,
    updated_by
  )
  VALUES (
    v_tenant,
    v_graph.id,
    v_graph.scope_id,
    v_scope.adapter_key,
    p_target_type,
    p_target_id,
    'active',
    v_actor,
    v_actor
  )
  ON CONFLICT (tenant_id, graph_id, target_type, target_id) DO UPDATE
  SET updated_at = clock_timestamp()
  RETURNING id INTO v_run;

  v_facts := flow.build_facts(v_graph.scope_id, p_target_type, p_target_id);

  INSERT INTO flow.events (tenant_id, run_id, kind, actor_id, facts)
  VALUES (v_tenant, v_run, 'run_ensure', v_actor, v_facts);

  FOR v_start IN
    SELECT n.id
    FROM flow.nodes n
    WHERE n.tenant_id = v_tenant
      AND n.graph_id = v_graph.id
      AND n.kind = 'start'
    ORDER BY n.sort_order, n.code
  LOOP
    PERFORM flow.node_open(v_run, v_start, v_facts);
  END LOOP;

  RETURN v_run;
END
$$;

CREATE OR REPLACE FUNCTION flow.run_ensure(
  p_graph_code text,
  p_version text,
  p_scope_code text,
  p_target uuid
)
RETURNS uuid
LANGUAGE sql
AS $$
  SELECT flow.run_ensure(p_graph_code, p_version, p_scope_code, NULL::text, 'default', p_target::text);
$$;

CREATE OR REPLACE FUNCTION flow.node_open(p_run uuid, p_node uuid, p_facts jsonb DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant uuid := flow.current_tenant_id();
  v_actor uuid := flow.current_actor_id();
  v_node flow.nodes%ROWTYPE;
  v_run flow.runs%ROWTYPE;
  v_nr uuid;
  v_facts jsonb := p_facts;
BEGIN
  SELECT * INTO v_run FROM flow.runs WHERE id = p_run;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'run not found';
  END IF;

  SELECT * INTO v_node FROM flow.nodes WHERE id = p_node;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'node not found';
  END IF;

  IF v_facts IS NULL THEN
    v_facts := flow.build_facts(v_run.scope_id, v_run.target_type, v_run.target_id);
  END IF;

  IF NOT flow.eval_rule(v_node.entry_rule, v_facts) THEN
    RETURN NULL;
  END IF;

  INSERT INTO flow.node_runs (tenant_id, run_id, node_id, status, meta)
  VALUES (v_tenant, p_run, p_node, 'in_progress', '{}'::jsonb)
  RETURNING id INTO v_nr;

  INSERT INTO flow.events (tenant_id, run_id, node_id, kind, actor_id, facts)
  VALUES (v_tenant, p_run, p_node, 'node_open', v_actor, v_facts);

  IF v_node.kind = 'human' THEN
    INSERT INTO flow.tasks (
      tenant_id,
      run_id,
      node_run_id,
      node_id,
      assignee_type,
      assignee_id,
      assignee_user_id,
      status,
      allowed_actions
    )
    SELECT
      v_tenant,
      p_run,
      v_nr,
      p_node,
      candidate.agent_type,
      candidate.agent_id,
      CASE WHEN candidate.agent_type = 'user' THEN candidate.agent_id::uuid ELSE NULL END,
      'open',
      v_node.allowed_actions
    FROM flow.resolve_agents(p_node, p_run) candidate;

    IF NOT EXISTS (SELECT 1 FROM flow.tasks WHERE node_run_id = v_nr) THEN
      INSERT INTO flow.tasks (
        tenant_id,
        run_id,
        node_run_id,
        node_id,
        assignee_type,
        status,
        allowed_actions
      )
      VALUES (v_tenant, p_run, v_nr, p_node, 'unassigned', 'open', v_node.allowed_actions);
    END IF;

    INSERT INTO flow.events (tenant_id, run_id, node_id, kind, actor_id, facts)
    VALUES (v_tenant, p_run, p_node, 'task_create', v_actor, v_facts);
  ELSE
    PERFORM flow.node_try_complete(v_nr, NULL, NULL);
  END IF;

  RETURN v_nr;
END
$$;

CREATE OR REPLACE FUNCTION flow.task_complete(
  p_task uuid,
  p_action text,
  p_note text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  v_task flow.tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM flow.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  IF v_task.status = 'completed' THEN
    RETURN;
  END IF;

  IF v_task.status <> 'open' THEN
    RAISE EXCEPTION 'task is not open';
  END IF;

  UPDATE flow.tasks
  SET
    status = 'completed',
    decided_action = p_action,
    decided_at = clock_timestamp(),
    note = p_note,
    payload = COALESCE(p_payload, '{}'::jsonb),
    retired_at = clock_timestamp()
  WHERE id = p_task;

  INSERT INTO flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, note, payload)
  VALUES (v_task.tenant_id, v_task.run_id, v_task.node_id, p_task, 'task_done', v_actor, p_note, COALESCE(p_payload, '{}'::jsonb));

  PERFORM flow.node_try_complete(v_task.node_run_id, p_action, p_note);
END
$$;

CREATE OR REPLACE FUNCTION flow.task_assign(p_task uuid, p_user uuid, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  v_task flow.tasks%ROWTYPE;
BEGIN
  IF p_user IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  SELECT * INTO v_task FROM flow.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  UPDATE flow.tasks
  SET
    assignee_type = 'user',
    assignee_id = p_user::text,
    assignee_user_id = p_user,
    assigned_by = v_actor,
    assigned_at = clock_timestamp(),
    accepted_at = NULL,
    declined_at = NULL,
    withdrawn_at = NULL
  WHERE id = p_task;

  INSERT INTO flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, note)
  VALUES (v_task.tenant_id, v_task.run_id, v_task.node_id, p_task, 'task_assign', v_actor, p_note);

  RETURN p_user::text;
END
$$;

CREATE OR REPLACE FUNCTION flow.task_unassign(p_task uuid, p_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  v_task flow.tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM flow.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  UPDATE flow.tasks
  SET
    assignee_type = 'unassigned',
    assignee_id = NULL,
    assignee_user_id = NULL,
    assigned_by = NULL,
    assigned_at = NULL,
    accepted_at = NULL
  WHERE id = p_task;

  INSERT INTO flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, note)
  VALUES (v_task.tenant_id, v_task.run_id, v_task.node_id, p_task, 'task_assign', v_actor, p_note);

  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION flow.task_accept(p_task uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  v_task flow.tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM flow.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  IF v_task.assignee_user_id IS NOT NULL AND v_task.assignee_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the current assignee may accept the task';
  END IF;

  UPDATE flow.tasks
  SET accepted_at = clock_timestamp(), declined_at = NULL, withdrawn_at = NULL
  WHERE id = p_task;

  INSERT INTO flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, note)
  VALUES (v_task.tenant_id, v_task.run_id, v_task.node_id, p_task, 'task_accept', v_actor, p_note);
END
$$;

CREATE OR REPLACE FUNCTION flow.task_decline(p_task uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  v_task flow.tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM flow.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  IF v_task.assignee_user_id IS NOT NULL AND v_task.assignee_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the current assignee may decline the task';
  END IF;

  UPDATE flow.tasks
  SET declined_at = clock_timestamp(), accepted_at = NULL
  WHERE id = p_task;

  INSERT INTO flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, note)
  VALUES (v_task.tenant_id, v_task.run_id, v_task.node_id, p_task, 'task_decline', v_actor, p_note);

  PERFORM flow.task_unassign(p_task, p_note);
END
$$;

CREATE OR REPLACE FUNCTION flow.task_unaccept(p_task uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  v_task flow.tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM flow.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  IF v_task.assignee_user_id IS NOT NULL AND v_task.assignee_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the current assignee may unaccept the task';
  END IF;

  UPDATE flow.tasks
  SET accepted_at = NULL
  WHERE id = p_task;

  INSERT INTO flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, note)
  VALUES (v_task.tenant_id, v_task.run_id, v_task.node_id, p_task, 'task_unaccept', v_actor, p_note);
END
$$;

CREATE OR REPLACE FUNCTION flow.task_withdraw(p_task uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  v_task flow.tasks%ROWTYPE;
BEGIN
  SELECT * INTO v_task FROM flow.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'task not found';
  END IF;

  UPDATE flow.tasks
  SET
    withdrawn_at = clock_timestamp(),
    status = 'canceled',
    retired_at = clock_timestamp()
  WHERE id = p_task;

  INSERT INTO flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, note)
  VALUES (v_task.tenant_id, v_task.run_id, v_task.node_id, p_task, 'task_withdraw', v_actor, p_note);
END
$$;

CREATE OR REPLACE FUNCTION flow.node_try_complete(p_node_run uuid, p_action text, p_note text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  v_nr flow.node_runs%ROWTYPE;
  v_node flow.nodes%ROWTYPE;
  v_run flow.runs%ROWTYPE;
  v_done boolean := false;
  v_facts jsonb;
  v_next uuid;
  v_effect flow.transition_effects%ROWTYPE;
BEGIN
  SELECT * INTO v_nr FROM flow.node_runs WHERE id = p_node_run FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'node_run not found';
  END IF;

  IF v_nr.status = 'completed' THEN
    RETURN;
  END IF;

  SELECT * INTO v_node FROM flow.nodes WHERE id = v_nr.node_id;
  SELECT * INTO v_run FROM flow.runs WHERE id = v_nr.run_id;

  v_facts := flow.build_facts(v_run.scope_id, v_run.target_type, v_run.target_id);

  IF v_node.kind = 'human' THEN
    IF v_node.decision_policy = 'all' THEN
      v_done := NOT EXISTS (
        SELECT 1 FROM flow.tasks t
        WHERE t.node_run_id = v_nr.id AND t.status = 'open'
      );
    ELSIF v_node.decision_policy = 'quorum' THEN
      v_done := (
        SELECT
          COALESCE(COUNT(*) FILTER (WHERE t.status = 'completed'), 0)::numeric
          / GREATEST(COUNT(*), 1) >= COALESCE(v_node.quorum_ratio, 0.5)
        FROM flow.tasks t
        WHERE t.node_run_id = v_nr.id
      );
    ELSE
      v_done := EXISTS (
        SELECT 1 FROM flow.tasks t
        WHERE t.node_run_id = v_nr.id AND t.status = 'completed'
      );
    END IF;
  ELSE
    v_done := v_node.exit_rule IS NULL OR flow.eval_rule(v_node.exit_rule, v_facts);
  END IF;

  IF NOT v_done THEN
    RETURN;
  END IF;

  UPDATE flow.node_runs
  SET status = 'completed', closed_at = clock_timestamp()
  WHERE id = v_nr.id;

  UPDATE flow.tasks
  SET status = 'canceled', retired_at = clock_timestamp()
  WHERE node_run_id = v_nr.id
    AND status = 'open';

  INSERT INTO flow.events (tenant_id, run_id, node_id, kind, actor_id, note, facts)
  VALUES (v_run.tenant_id, v_run.id, v_node.id, 'node_complete', v_actor, p_note, v_facts);

  FOR v_effect IN
    SELECT *
    FROM flow.transition_effects effect
    WHERE effect.graph_id = v_run.graph_id
      AND (effect.node_code IS NULL OR effect.node_code = v_node.code)
      AND (effect.action IS NULL OR effect.action = p_action)
    ORDER BY effect.sort_order, effect.id
  LOOP
    INSERT INTO flow.events (tenant_id, run_id, node_id, kind, actor_id, payload)
    VALUES (
      v_run.tenant_id,
      v_run.id,
      v_node.id,
      'effect_requested',
      v_actor,
      jsonb_build_object('effectKey', v_effect.effect_key, 'payload', v_effect.payload)
    );
  END LOOP;

  FOR v_next IN
    SELECT e.to_node_id
    FROM flow.edges e
    WHERE e.graph_id = v_run.graph_id
      AND e.from_node_id = v_node.id
      AND (e.action IS NULL OR e.action = p_action)
      AND flow.eval_rule(e.rule, v_facts)
    ORDER BY e.sort_order, e.id
  LOOP
    INSERT INTO flow.events (tenant_id, run_id, node_id, kind, actor_id, payload)
    VALUES (
      v_run.tenant_id,
      v_run.id,
      v_node.id,
      'transition',
      v_actor,
      jsonb_build_object('fromNodeId', v_node.id, 'toNodeId', v_next, 'action', p_action)
    );
    PERFORM flow.node_open(v_run.id, v_next, v_facts);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM flow.node_runs nr
    WHERE nr.run_id = v_run.id
      AND nr.status IN ('pending', 'in_progress')
  ) THEN
    UPDATE flow.runs
    SET status = 'completed', updated_at = clock_timestamp(), updated_by = v_actor
    WHERE id = v_run.id
      AND status = 'active';

    INSERT INTO flow.events (tenant_id, run_id, kind, actor_id)
    VALUES (v_run.tenant_id, v_run.id, 'run_complete', v_actor);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION flow.signal_changed(p_scope uuid, p_target_type text, p_target_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_actor uuid := flow.current_actor_id();
  r RECORD;
BEGIN
  INSERT INTO flow.events (tenant_id, run_id, kind, actor_id, facts)
  SELECT ru.tenant_id, ru.id, 'signal_received', v_actor, flow.build_facts(ru.scope_id, ru.target_type, ru.target_id)
  FROM flow.runs ru
  WHERE ru.scope_id = p_scope
    AND ru.target_id = p_target_id
    AND (p_target_type IS NULL OR ru.target_type = p_target_type)
    AND ru.status = 'active';

  FOR r IN
    SELECT nr.id
    FROM flow.runs ru
    JOIN flow.node_runs nr ON nr.run_id = ru.id
    WHERE ru.scope_id = p_scope
      AND ru.target_id = p_target_id
      AND (p_target_type IS NULL OR ru.target_type = p_target_type)
      AND ru.status = 'active'
      AND nr.status IN ('pending', 'in_progress')
  LOOP
    PERFORM flow.node_try_complete(r.id, NULL, 'facts_changed');
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION flow.signal_changed(p_scope uuid, p_target uuid)
RETURNS void
LANGUAGE sql
AS $$
  SELECT flow.signal_changed(p_scope, NULL::text, p_target::text);
$$;

SELECT data.register_softdelete_fk('flow', 'scopes', 'flow', 'graphs', 'graphs_scope_id_fkey', 'block');
SELECT data.register_softdelete_fk('flow', 'graphs', 'flow', 'nodes', 'nodes_graph_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'graphs', 'flow', 'edges', 'edges_graph_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'nodes', 'flow', 'edges', 'edges_from_node_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'nodes', 'flow', 'edges', 'edges_to_node_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'nodes', 'flow', 'agent_rules', 'agent_rules_node_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'graphs', 'flow', 'transition_effects', 'transition_effects_graph_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'scopes', 'flow', 'policy_sets', 'policy_sets_scope_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'policy_sets', 'flow', 'policy_rules', 'policy_rules_policy_set_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'scopes', 'flow', 'forms', 'forms_scope_id_fkey', 'block');
SELECT data.register_softdelete_fk('flow', 'forms', 'flow', 'questions', 'questions_form_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'questions', 'flow', 'scores', 'scores_question_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'forms', 'flow', 'fills', 'fills_form_id_fkey', 'block');
SELECT data.register_softdelete_fk('flow', 'scopes', 'flow', 'fills', 'fills_scope_id_fkey', 'block');
SELECT data.register_softdelete_fk('flow', 'fills', 'flow', 'answers', 'answers_fill_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'questions', 'flow', 'answers', 'answers_question_id_fkey', 'block');
SELECT data.register_softdelete_fk('flow', 'scopes', 'flow', 'waivers', 'waivers_scope_id_fkey', 'block');
SELECT data.register_softdelete_fk('flow', 'forms', 'flow', 'waivers', 'waivers_form_id_fkey', 'block');
SELECT data.register_softdelete_fk('flow', 'questions', 'flow', 'waivers', 'waivers_question_id_fkey', 'hide');
SELECT data.register_softdelete_fk('flow', 'nodes', 'flow', 'node_form_rules', 'node_form_rules_node_id_fkey', 'cascade');
SELECT data.register_softdelete_fk('flow', 'forms', 'flow', 'node_form_rules', 'node_form_rules_form_id_fkey', 'block');

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA flow TO stynx_app;
GRANT SELECT ON ALL TABLES IN SCHEMA flow TO stynx_reader;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA flow TO stynx_app, stynx_reader;

ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA flow
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO stynx_app;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA flow
  GRANT SELECT ON TABLES TO stynx_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE stynx_owner IN SCHEMA flow
  GRANT USAGE, SELECT ON SEQUENCES TO stynx_app, stynx_reader;
