/* istanbul ignore file -- declarative Drizzle schema; migrations and query helpers exercise the runtime behavior. */
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
import { perms, users } from './auth';
import { tenants } from './tenancy';

export const worklistSchema = pgSchema('worklist');

export const worklistItemStatus = worklistSchema.enum('item_status', [
  'pending',
  'claimed',
  'completed',
  'canceled',
]);

export const worklistEventKind = worklistSchema.enum('event_kind', [
  'enqueue',
  'claim',
  'assign',
  'release',
  'complete',
  'cancel',
  'reassign',
  'override',
  'deadline_set',
  'deadline_breach',
]);

export const worklistQueues = softDeletable(
  worklistSchema.table('queues', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    strategy: text('strategy').notNull().default('pull'),
    strategyConfig: jsonb('strategy_config').notNull().default({}),
    requiredPermission: text('required_permission')
      .notNull()
      .references(() => perms.key),
    supervisorPermission: text('supervisor_permission')
      .notNull()
      .references(() => perms.key),
    claimLimit: integer('claim_limit'),
    defaultSlaSeconds: integer('default_sla_seconds'),
    defaultSlaBusinessDays: integer('default_sla_business_days'),
    defaultCalendarKey: text('default_calendar_key'),
    meta: jsonb('meta').notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  }),
);

/**
 * Operational state for RBAC-derived workers. A row never grants queue access;
 * permission-bearing users without a row are available with weight 1.
 */
export const worklistWorkerState = softDeletable(
  worklistSchema.table('worker_state', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    queueId: uuid('queue_id')
      .notNull()
      .references(() => worklistQueues.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    isAvailable: boolean('is_available').notNull().default(true),
    weight: numeric('weight').notNull().default('1'),
    lastAssignedAt: timestamp('last_assigned_at', { withTimezone: true }),
    meta: jsonb('meta').notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  }),
);

export const worklistItems = makeLiveOnly(
  worklistSchema.table('items', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    queueId: uuid('queue_id')
      .notNull()
      .references(() => worklistQueues.id),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    priority: integer('priority').notNull().default(100),
    status: worklistItemStatus('status').notNull().default('pending'),
    assigneeId: uuid('assignee_id').references(() => users.id),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    deadlineKind: text('deadline_kind'),
    deadlineBusinessDays: integer('deadline_business_days'),
    deadlineCalendarKey: text('deadline_calendar_key'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    breachDetectedAt: timestamp('breach_detected_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedBy: uuid('completed_by').references(() => users.id),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    payload: jsonb('payload').notNull().default({}),
    meta: jsonb('meta').notNull().default({}),
    createdBy: uuid('created_by').references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  }),
);

export const worklistItemEvents = makeLiveOnly(
  worklistSchema.table('item_events', {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    itemId: uuid('item_id')
      .notNull()
      .references(() => worklistItems.id),
    kind: worklistEventKind('kind').notNull(),
    actorId: uuid('actor_id'),
    fromAssignee: uuid('from_assignee'),
    toAssignee: uuid('to_assignee'),
    reason: text('reason'),
    payload: jsonb('payload').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  }),
);
