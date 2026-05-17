import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { makeLiveOnly, softDeletable } from '../table-markers';
import { users } from './auth';
import { tenants } from './tenancy';

export const flowSchema = pgSchema('flow');

export const flowNodeKind = flowSchema.enum('node_kind', [
  'human',
  'auto',
  'system',
  'start',
  'end',
  'gateway',
]);

export const flowDecisionPolicy = flowSchema.enum('decision_policy', ['all', 'any', 'quorum']);

export const flowRunStatus = flowSchema.enum('run_status', [
  'active',
  'completed',
  'canceled',
]);

export const flowNodeRunStatus = flowSchema.enum('node_run_status', [
  'pending',
  'in_progress',
  'completed',
  'canceled',
]);

export const flowTaskStatus = flowSchema.enum('task_status', [
  'open',
  'completed',
  'expired',
  'canceled',
]);

export const flowAgentRuleType = flowSchema.enum('agent_rule_type', [
  'permission',
  'user',
  'resolver_fn',
]);

export const flowGatingMode = flowSchema.enum('gating_mode', [
  'all_required',
  'any',
  'threshold',
]);

export const flowFieldType = flowSchema.enum('field_type', [
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
  'email',
]);

export const flowEventKind = flowSchema.enum('event_kind', [
  'run_create',
  'run_ensure',
  'node_open',
  'task_create',
  'task_done',
  'task_assign',
  'node_complete',
  'transition',
  'effect_requested',
  'effect_succeeded',
  'effect_failed',
  'run_complete',
  'run_cancel',
  'facts_changed',
  'signal_received',
  'task_accept',
  'task_decline',
  'task_withdraw',
  'task_unaccept',
]);

export const flowPolicyEffect = flowSchema.enum('policy_effect', ['allow', 'deny']);

export const scopes = softDeletable(flowSchema.table('scopes', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  code: text('code').notNull(),
  label: text('label').notNull(),
  adapterKey: text('adapter_key').notNull(),
  adapterConfig: jsonb('adapter_config').notNull().default({}),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const graphs = softDeletable(flowSchema.table('graphs', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  scopeId: uuid('scope_id').notNull().references(() => scopes.id),
  code: text('code').notNull(),
  version: text('version').notNull().default('v1'),
  isActive: boolean('is_active').notNull().default(true),
  name: text('name'),
  description: text('description'),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const nodes = softDeletable(flowSchema.table('nodes', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  graphId: uuid('graph_id').notNull().references(() => graphs.id),
  code: text('code').notNull(),
  name: text('name'),
  kind: flowNodeKind('kind').notNull(),
  decisionPolicy: flowDecisionPolicy('decision_policy').notNull().default('any'),
  quorumRatio: numeric('quorum_ratio'),
  allowedActions: text('allowed_actions').array().notNull(),
  slaSeconds: integer('sla_seconds'),
  entryRule: text('entry_rule'),
  exitRule: text('exit_rule'),
  sortOrder: integer('sort_order').notNull().default(0),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const edges = softDeletable(flowSchema.table('edges', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  graphId: uuid('graph_id').notNull().references(() => graphs.id),
  fromNodeId: uuid('from_node_id').notNull().references(() => nodes.id),
  toNodeId: uuid('to_node_id').notNull().references(() => nodes.id),
  action: text('action'),
  rule: text('rule'),
  spawn: boolean('spawn').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const agentRules = softDeletable(flowSchema.table('agent_rules', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  nodeId: uuid('node_id').notNull().references(() => nodes.id),
  ruleType: flowAgentRuleType('rule_type').notNull(),
  permissionKey: text('permission_key'),
  userId: uuid('user_id').references(() => users.id),
  resolverKey: text('resolver_key'),
  params: jsonb('params').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const transitionEffects = softDeletable(flowSchema.table('transition_effects', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  graphId: uuid('graph_id').notNull().references(() => graphs.id),
  nodeCode: text('node_code'),
  action: text('action'),
  effectKey: text('effect_key').notNull(),
  payload: jsonb('payload').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const policySets = softDeletable(flowSchema.table('policy_sets', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  scopeId: uuid('scope_id').notNull().references(() => scopes.id),
  version: text('version').notNull(),
  isActive: boolean('is_active').notNull().default(false),
  name: text('name'),
  description: text('description'),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const policyRules = softDeletable(flowSchema.table('policy_rules', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  policySetId: uuid('policy_set_id').notNull().references(() => policySets.id),
  nodeCode: text('node_code'),
  statusCode: text('status_code'),
  action: text('action'),
  capability: text('capability'),
  effect: flowPolicyEffect('effect').notNull(),
  priority: integer('priority').notNull().default(0),
  reasonCode: text('reason_code'),
  conditions: jsonb('conditions').notNull().default({}),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const runs = makeLiveOnly(flowSchema.table('runs', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  scopeId: uuid('scope_id').notNull().references(() => scopes.id),
  graphId: uuid('graph_id').notNull().references(() => graphs.id),
  adapterKey: text('adapter_key').notNull(),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  status: flowRunStatus('status').notNull().default('active'),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  meta: jsonb('meta').notNull().default({}),
}));

export const nodeRuns = makeLiveOnly(flowSchema.table('node_runs', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  runId: uuid('run_id').notNull().references(() => runs.id),
  nodeId: uuid('node_id').notNull().references(() => nodes.id),
  status: flowNodeRunStatus('status').notNull().default('pending'),
  openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  meta: jsonb('meta').notNull().default({}),
}));

export const tasks = makeLiveOnly(flowSchema.table('tasks', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  runId: uuid('run_id').notNull().references(() => runs.id),
  nodeRunId: uuid('node_run_id').notNull().references(() => nodeRuns.id),
  nodeId: uuid('node_id').notNull().references(() => nodes.id),
  assigneeType: text('assignee_type').notNull().default('unassigned'),
  assigneeId: text('assignee_id'),
  assigneeUserId: uuid('assignee_user_id').references(() => users.id),
  assignedBy: uuid('assigned_by').references(() => users.id),
  status: flowTaskStatus('status').notNull().default('open'),
  allowedActions: text('allowed_actions').array().notNull(),
  payload: jsonb('payload').notNull().default({}),
  note: text('note'),
  decidedAction: text('decided_action'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  declinedAt: timestamp('declined_at', { withTimezone: true }),
  withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  dueAt: timestamp('due_at', { withTimezone: true }),
}));

export const events = makeLiveOnly(flowSchema.table('events', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  runId: uuid('run_id').notNull().references(() => runs.id),
  nodeId: uuid('node_id').references(() => nodes.id),
  taskId: uuid('task_id').references(() => tasks.id),
  kind: flowEventKind('kind').notNull(),
  actorId: uuid('actor_id'),
  actorLabel: text('actor_label'),
  note: text('note'),
  facts: jsonb('facts'),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}));

export const forms = softDeletable(flowSchema.table('forms', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  scopeId: uuid('scope_id').notNull().references(() => scopes.id),
  code: text('code').notNull(),
  version: text('version').notNull().default('v1'),
  title: text('title').notNull(),
  description: text('description'),
  isActive: boolean('is_active').notNull().default(true),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const questions = softDeletable(flowSchema.table('questions', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  formId: uuid('form_id').notNull().references(() => forms.id),
  key: text('key').notNull(),
  label: text('label').notNull(),
  fieldType: flowFieldType('field_type').notNull(),
  required: boolean('required').notNull().default(false),
  blocksSubmit: boolean('blocks_submit').notNull().default(false),
  options: jsonb('options').notNull().default([]),
  validators: jsonb('validators').notNull().default({}),
  visibleIf: jsonb('visible_if').notNull().default({}),
  sortOrder: integer('sort_order').notNull().default(0),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const scores = softDeletable(flowSchema.table('scores', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  questionId: uuid('question_id').notNull().references(() => questions.id),
  passPoints: numeric('pass_points').notNull().default('1'),
  failPoints: numeric('fail_points').notNull().default('0'),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const fills = softDeletable(flowSchema.table('fills', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  formId: uuid('form_id').notNull().references(() => forms.id),
  scopeId: uuid('scope_id').notNull().references(() => scopes.id),
  runId: uuid('run_id').references(() => runs.id),
  nodeRunId: uuid('node_run_id').references(() => nodeRuns.id),
  taskId: uuid('task_id').references(() => tasks.id),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  status: text('status').notNull().default('draft'),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const answers = softDeletable(flowSchema.table('answers', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  fillId: uuid('fill_id').notNull().references(() => fills.id),
  questionId: uuid('question_id').notNull().references(() => questions.id),
  value: jsonb('value'),
  attachment: jsonb('attachment'),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const waivers = softDeletable(flowSchema.table('waivers', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  scopeId: uuid('scope_id').notNull().references(() => scopes.id),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  formId: uuid('form_id').notNull().references(() => forms.id),
  questionId: uuid('question_id').references(() => questions.id),
  reason: text('reason').notNull(),
  waivedBy: uuid('waived_by').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));

export const nodeFormRules = softDeletable(flowSchema.table('node_form_rules', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  nodeId: uuid('node_id').notNull().references(() => nodes.id),
  formId: uuid('form_id').notNull().references(() => forms.id),
  required: boolean('required').notNull().default(true),
  gatingMode: flowGatingMode('gating_mode').notNull().default('all_required'),
  threshold: numeric('threshold'),
  applicability: jsonb('applicability').notNull().default({}),
  weight: numeric('weight').notNull().default('1'),
  meta: jsonb('meta').notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}));
