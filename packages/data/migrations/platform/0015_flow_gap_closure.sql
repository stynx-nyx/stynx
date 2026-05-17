ALTER TYPE flow.event_kind ADD VALUE IF NOT EXISTS 'effect_succeeded' AFTER 'effect_requested';
ALTER TYPE flow.event_kind ADD VALUE IF NOT EXISTS 'effect_failed' AFTER 'effect_succeeded';

CREATE OR REPLACE FUNCTION flow.node_form_rules_satisfied(p_node_run uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_nr flow.node_runs%ROWTYPE;
  v_node flow.nodes%ROWTYPE;
  v_run flow.runs%ROWTYPE;
  v_facts jsonb;
BEGIN
  SELECT * INTO v_nr FROM flow.node_runs WHERE id = p_node_run;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'node_run not found';
  END IF;

  SELECT * INTO v_node FROM flow.nodes WHERE id = v_nr.node_id;
  SELECT * INTO v_run FROM flow.runs WHERE id = v_nr.run_id;

  IF v_node.kind <> 'human' THEN
    RETURN true;
  END IF;

  v_facts := flow.build_facts(v_run.scope_id, v_run.target_type, v_run.target_id);

  RETURN NOT EXISTS (
    SELECT 1
    FROM flow.node_form_rules rule
    JOIN flow.forms form ON form.id = rule.form_id
    WHERE rule.node_id = v_node.id
      AND rule.required
      AND form.is_active
      AND NOT (
        CASE rule.gating_mode
          WHEN 'all_required' THEN
            COALESCE((v_facts #>> ARRAY['forms', 'byFormCode', form.code, 'autoPass'])::boolean, false)
          WHEN 'threshold' THEN
            COALESCE(NULLIF(v_facts #>> ARRAY['forms', 'byFormCode', form.code, 'score'], '')::numeric, 0)
              >= COALESCE(rule.threshold, 0)
          WHEN 'any' THEN
            EXISTS (
              SELECT 1
              FROM flow.fills fill
              JOIN flow.answers answer ON answer.fill_id = fill.id
              WHERE fill.scope_id = v_run.scope_id
                AND fill.form_id = rule.form_id
                AND fill.target_type = v_run.target_type
                AND fill.target_id = v_run.target_id
            )
            OR EXISTS (
              SELECT 1
              FROM flow.waivers waiver
              WHERE waiver.scope_id = v_run.scope_id
                AND waiver.form_id = rule.form_id
                AND waiver.target_type = v_run.target_type
                AND waiver.target_id = v_run.target_id
                AND (waiver.expires_at IS NULL OR waiver.expires_at > clock_timestamp())
            )
          ELSE true
        END
      )
  );
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

  IF NOT flow.node_form_rules_satisfied(v_task.node_run_id) THEN
    RAISE EXCEPTION 'required flow form rules are not satisfied';
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

SELECT audit.enable_for('flow.scopes'::regclass);
SELECT audit.enable_for('flow.graphs'::regclass);
SELECT audit.enable_for('flow.nodes'::regclass);
SELECT audit.enable_for('flow.edges'::regclass);
SELECT audit.enable_for('flow.agent_rules'::regclass);
SELECT audit.enable_for('flow.transition_effects'::regclass);
SELECT audit.enable_for('flow.policy_sets'::regclass);
SELECT audit.enable_for('flow.policy_rules'::regclass);
SELECT audit.enable_for('flow.runs'::regclass);
SELECT audit.enable_for('flow.node_runs'::regclass);
SELECT audit.enable_for('flow.tasks'::regclass);
SELECT audit.enable_for('flow.events'::regclass);
SELECT audit.enable_for('flow.forms'::regclass);
SELECT audit.enable_for('flow.questions'::regclass);
SELECT audit.enable_for('flow.scores'::regclass);
SELECT audit.enable_for('flow.fills'::regclass);
SELECT audit.enable_for('flow.answers'::regclass);
SELECT audit.enable_for('flow.waivers'::regclass);
SELECT audit.enable_for('flow.node_form_rules'::regclass);

CREATE OR REPLACE FUNCTION flow.touch_signal_from_form_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_fill flow.fills%ROWTYPE;
  v_scope_id uuid;
  v_target_type text;
  v_target_id text;
BEGIN
  IF TG_TABLE_NAME = 'answers' THEN
    SELECT *
    INTO v_fill
    FROM flow.fills
    WHERE tenant_id = CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END
      AND id = CASE WHEN TG_OP = 'DELETE' THEN OLD.fill_id ELSE NEW.fill_id END;

    IF FOUND THEN
      PERFORM flow.signal_changed(v_fill.scope_id, v_fill.target_type, v_fill.target_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'waivers' THEN
    IF TG_OP = 'DELETE' THEN
      v_scope_id := OLD.scope_id;
      v_target_type := OLD.target_type;
      v_target_id := OLD.target_id;
    ELSE
      v_scope_id := NEW.scope_id;
      v_target_type := NEW.target_type;
      v_target_id := NEW.target_id;
    END IF;

    IF v_scope_id IS NOT NULL AND v_target_id IS NOT NULL THEN
      PERFORM flow.signal_changed(v_scope_id, v_target_type, v_target_id);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_flow_answers_signal_touch ON flow.answers;
CREATE TRIGGER trg_flow_answers_signal_touch
AFTER INSERT OR UPDATE OR DELETE ON flow.answers
FOR EACH ROW EXECUTE FUNCTION flow.touch_signal_from_form_mutation();

DROP TRIGGER IF EXISTS trg_flow_waivers_signal_touch ON flow.waivers;
CREATE TRIGGER trg_flow_waivers_signal_touch
AFTER INSERT OR UPDATE OR DELETE ON flow.waivers
FOR EACH ROW EXECUTE FUNCTION flow.touch_signal_from_form_mutation();
