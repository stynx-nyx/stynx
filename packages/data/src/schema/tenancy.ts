import { boolean, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const tenancySchema = pgSchema('tenancy');

export const tenants = tenancySchema.table('tenants', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull(),
  name: text('name').notNull(),
  state: text('state').notNull().default('active'),
  isActive: boolean('is_active').notNull().default(true),
  suspendedReason: text('suspended_reason'),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const tenantSettings = tenancySchema.table('tenant_settings', {
  tenantId: uuid('tenant_id').primaryKey().references(() => tenants.id),
  timezone: text('timezone'),
  locale: text('locale'),
  settings: jsonb('settings').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
