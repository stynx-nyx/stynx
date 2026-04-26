import {
  bigserial,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const auditSchema = pgSchema('audit');

export const auditLog = auditSchema.table('log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  tableSchema: text('table_schema').notNull(),
  tableName: text('table_name').notNull(),
  operation: text('operation').notNull(),
  tenantId: uuid('tenant_id'),
  actorId: uuid('actor_id'),
  requestId: text('request_id'),
  payload: jsonb('payload'),
});

export const systemOp = auditSchema.table('system_op', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  reason: text('reason').notNull(),
  actorId: uuid('actor_id'),
  requestId: text('request_id').notNull(),
  payload: jsonb('payload'),
});
