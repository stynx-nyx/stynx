import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

const text = z.string();
const nullableText = text.nullable();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const integer = z.number().int().min(-2147483648).max(2147483647);
const channel = z.enum(['email', 'sms', 'push', 'inapp']);
const status = z.enum(['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED']);
const claimedDelivery = z.object({
 id: uuid, tenant_id: uuid, notification_id: uuid, channel,
 attempt_count: integer, max_attempts: integer,
 recipient_subject_id: text, recipient_email: nullableText, recipient_phone: nullableText,
 recipient_push_token: nullableText, template_id: text, template_version: integer,
 locale: text, variables: z.record(text, z.json()),
});

export const insertNotification = defineQuery({
 name: 'notifications.insertNotification',
 text: sql`insert into notifications.notifications
           (id, tenant_id, recipient_subject_id, recipient_email, recipient_phone,
            recipient_push_token, category, template_id, template_version, locale,
            variables, requested_channels, correlation_id, created_by_actor_id)
         values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::text[], $13, $14)`,
 params: z.tuple([uuid, uuid, text, nullableText, nullableText, nullableText, text, text, integer, text, text, z.array(channel), nullableText, uuid.nullable()]), row: z.object({}), expects: 'none',
});

export const insertDelivery = defineQuery({
 name: 'notifications.insertDelivery',
 text: sql`insert into notifications.deliveries
             (id, tenant_id, notification_id, channel, status, suppressed_reason, next_attempt_at)
           values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, clock_timestamp())`,
 params: z.tuple([uuid, uuid, uuid, channel, status, nullableText]), row: z.object({}), expects: 'none',
});

export const notificationByCorrelation = defineQuery({
 name: 'notifications.notificationByCorrelation',
 text: sql`select id from notifications.notifications
          where tenant_id = $1::uuid and correlation_id = $2
          limit 1`,
 params: z.tuple([uuid, text]), row: z.object({ id: uuid }), expects: 'many',
});

export const notificationDeliveries = defineQuery({
 name: 'notifications.notificationDeliveries',
 text: sql`select id, channel, status from notifications.deliveries
          where tenant_id = $1::uuid and notification_id = $2::uuid
          order by channel`,
 params: z.tuple([uuid, uuid]), row: z.object({ id: uuid, channel, status }), expects: 'many',
});

export const claimDueDeliveries = defineQuery({
 name: 'notifications.claimDueDeliveries',
 text: sql`select d.id, d.tenant_id, d.notification_id, d.channel, d.attempt_count, d.max_attempts,
                  n.recipient_subject_id, n.recipient_email, n.recipient_phone, n.recipient_push_token,
                  n.template_id, n.template_version, n.locale, n.variables
             from notifications.deliveries d
             join notifications.notifications n on n.id = d.notification_id and n.tenant_id = d.tenant_id
            where d.status = 'QUEUED' and d.next_attempt_at <= $1::timestamptz
            order by d.next_attempt_at, d.created_at
            for update of d skip locked
            limit $2`,
 params: z.tuple([text, integer]), row: claimedDelivery, expects: 'many',
});

export const markClaimedDelivery = defineQuery({
 name: 'notifications.markClaimedDelivery',
 text: sql`update notifications.deliveries
                set status = 'SENT', attempt_count = attempt_count + 1, last_attempt_at = clock_timestamp(),
                    sent_at = clock_timestamp(), updated_at = clock_timestamp()
              where id = $1::uuid and tenant_id = $2::uuid`,
 params: z.tuple([uuid, uuid]), row: z.object({}), expects: 'none',
});

export const persistDeliveryOutcome = defineQuery({
 name: 'notifications.persistDeliveryOutcome',
 text: sql`update notifications.deliveries
              set status = $3, provider_message_id = $4, error_code = $5, error_detail = $6,
                  suppressed_reason = $7,
                  next_attempt_at = case when $3 = 'QUEUED' then clock_timestamp() + ($8 * interval '1 millisecond') else next_attempt_at end,
                  delivered_at = case when $3 = 'DELIVERED' then clock_timestamp() else delivered_at end,
                  failed_at = case when $3 = 'FAILED' then clock_timestamp() else failed_at end,
                  updated_at = clock_timestamp()
            where id = $1::uuid and tenant_id = $2::uuid`,
 params: z.tuple([uuid, uuid, status, nullableText, nullableText, nullableText, nullableText, z.number().finite()]), row: z.object({}), expects: 'none',
});

export const insertInboxItem = defineQuery({
 name: 'notifications.insertInboxItem',
 text: sql`insert into notifications.inbox_items
           (id, tenant_id, recipient_subject_id, notification_id, delivery_id, title, body, locale, created_at)
         values ($1::uuid, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8, clock_timestamp())
         on conflict (delivery_id) do nothing`,
 params: z.tuple([uuid, uuid, text, uuid, uuid, z.unknown(), z.unknown(), text]), row: z.object({}), expects: 'none',
});

export const markInboxRead = defineQuery({
 name: 'notifications.markInboxRead',
 text: sql`update notifications.inbox_items set read_at = coalesce(read_at, clock_timestamp())
        where id = $1::uuid and tenant_id = $2::uuid`,
 params: z.tuple([uuid, uuid]), row: z.object({}), expects: 'none',
});


const inboxTimestamp = z.union([
 z.instanceof(Date), text,
 z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY),
]);
export const listInboxItems = defineQuery({
 name: 'notifications.listInboxItems',
 text: sql`select id, notification_id as "notificationId", delivery_id as "deliveryId", title, body, locale,
              read_at as "readAt", dismissed_at as "dismissedAt", created_at as "createdAt"
         from notifications.inbox_items
        where tenant_id = $1::uuid and recipient_subject_id = $2
          and ($3::boolean = false or read_at is null)
        order by created_at desc limit $4`,
 params: z.tuple([uuid, text, z.boolean(), z.custom<number>((value) => typeof value === 'number')]),
 row: z.object({ id: uuid, notificationId: uuid, deliveryId: uuid, title: text, body: text, locale: text,
  readAt: inboxTimestamp.nullable(), dismissedAt: inboxTimestamp.nullable(), createdAt: inboxTimestamp }),
 expects: 'many',
});
