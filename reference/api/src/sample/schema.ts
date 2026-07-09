/* istanbul ignore file -- declarative Drizzle schema; reference API behavior is covered through services/controllers. */
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  integer,
  numeric,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { softDeletable, tenants, users } from '@stynx-nyx/data';

export const sampleSchema = pgSchema('sample');

export const records = softDeletable(sampleSchema.table(
  'record',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    title: text('title').notNull(),
    email: text('email').notNull(),
    externalRef: text('external_ref'),
    status: text('status').notNull().default('active'),
    ownerUserId: uuid('owner_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    updatedBy: uuid('updated_by').notNull(),
  },
  (table) => ({
    statusCheck: check('sample_record_status_check', sql`${table.status} in ('active', 'pending', 'inactive')`),
  }),
));

export const recordNotes = softDeletable(sampleSchema.table(
  'record_note',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    recordId: uuid('record_id').notNull().references(() => records.id),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    detail: text('detail').notNull(),
    detail2: text('detail2'),
    region: text('region').notNull(),
    code: text('code').notNull(),
    locale: text('locale').notNull().default('en'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    updatedBy: uuid('updated_by').notNull(),
  },
  (table) => ({
    kindCheck: check('sample_record_note_kind_check', sql`${table.kind} in ('primary', 'secondary', 'internal')`),
  }),
));

export const workItems = softDeletable(sampleSchema.table(
  'work_item',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    recordId: uuid('record_id').notNull().references(() => records.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    code: text('code').notNull(),
    openedOn: date('opened_on').notNull(),
    targetOn: date('target_on').notNull(),
    category: text('category').notNull().default('GEN'),
    totalUnits: bigint('total_units', { mode: 'number' }).notNull().default(0),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    updatedBy: uuid('updated_by').notNull(),
  },
  (table) => ({
    statusCheck: check('sample_work_item_status_check', sql`${table.status} in ('draft', 'ready', 'done', 'cancelled')`),
  }),
));

export const workItemEntries = softDeletable(sampleSchema.table('work_item_entry', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  workItemId: uuid('work_item_id').notNull().references(() => workItems.id),
  description: text('description').notNull(),
  quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
  unitUnits: bigint('unit_units', { mode: 'number' }).notNull(),
  totalUnits: integer('total_units').generatedAlwaysAs(() => sql`(quantity * unit_units)::integer`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  createdBy: uuid('created_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  updatedBy: uuid('updated_by').notNull(),
}));

export const workItemLocks = softDeletable(sampleSchema.table(
  'work_item_lock',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
    workItemId: uuid('work_item_id').notNull().references(() => workItems.id),
    lockedAt: timestamp('locked_at', { withTimezone: true }).notNull(),
    amountUnits: bigint('amount_units', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    externalRef: text('external_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    updatedBy: uuid('updated_by').notNull(),
  },
  (table) => ({
    reasonCheck: check('sample_work_item_lock_reason_check', sql`${table.reason} in ('manual', 'external', 'review', 'hold')`),
  }),
));
