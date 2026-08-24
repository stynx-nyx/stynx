/* istanbul ignore file -- declarative Drizzle schema; the migration is the contract. */
import { integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenancy';

export const notificationsSchema = pgSchema('notifications');
export const deliveryStatus = notificationsSchema.enum('delivery_status', ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED']);
export const notifications = notificationsSchema.table('notifications', {
  id: uuid('id').primaryKey(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  recipientSubjectId: text('recipient_subject_id').notNull(), recipientEmail: text('recipient_email'), recipientPhone: text('recipient_phone'), recipientPushToken: text('recipient_push_token'),
  category: text('category').notNull(), templateId: text('template_id').notNull(), templateVersion: integer('template_version').notNull(), locale: text('locale').notNull(),
  variables: jsonb('variables').notNull().default({}), requestedChannels: text('requested_channels').array().notNull(), correlationId: text('correlation_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
export const deliveries = notificationsSchema.table('deliveries', {
  id: uuid('id').primaryKey(), tenantId: uuid('tenant_id').notNull().references(() => tenants.id), notificationId: uuid('notification_id').notNull().references(() => notifications.id),
  channel: text('channel').notNull(), status: deliveryStatus('status').notNull(), attemptCount: integer('attempt_count').notNull(), maxAttempts: integer('max_attempts').notNull(),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(), lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }), sentAt: timestamp('sent_at', { withTimezone: true }), deliveredAt: timestamp('delivered_at', { withTimezone: true }), failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});
