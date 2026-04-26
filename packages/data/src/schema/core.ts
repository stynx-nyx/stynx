import {
  bigint,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy';

export const coreSchema = pgSchema('core');

export const config = coreSchema.table('config', {
  key: text('key').primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const rateLimitOverrides = coreSchema.table('rate_limit_overrides', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  bucket: text('bucket').notNull(),
  scope: text('scope').notNull(),
  limitValue: integer('limit_value').notNull(),
  windowSeconds: integer('window_seconds').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const idempotencyKeys = coreSchema.table('idempotency_keys', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  key: text('key').notNull(),
  status: text('status').notNull(),
  requestFingerprint: text('request_fingerprint'),
  response: jsonb('response'),
  responseHeaders: jsonb('response_headers'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const schemaMigrations = coreSchema.table('schema_migrations', {
  id: text('id').primaryKey(),
  checksum: text('checksum'),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull(),
});

export const softdeleteFkRegistry = coreSchema.table('softdelete_fk_registry', {
  id: uuid('id').primaryKey(),
  parentSchema: text('parent_schema').notNull(),
  parentTable: text('parent_table').notNull(),
  childSchema: text('child_schema').notNull(),
  childTable: text('child_table').notNull(),
  fkConstraint: text('fk_constraint').notNull(),
  behavior: text('behavior').notNull(),
});

export const piiMap = coreSchema.table('pii_map', {
  id: uuid('id').primaryKey(),
  tableSchema: text('table_schema').notNull(),
  tableName: text('table_name').notNull(),
  columnName: text('column_name').notNull(),
  strategy: text('strategy').notNull(),
  category: text('category'),
  notes: text('notes'),
  version: bigint('version', { mode: 'number' }).notNull().default(1),
});
