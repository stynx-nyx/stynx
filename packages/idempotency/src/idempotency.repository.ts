import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

const uuid = z.string().regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const text = z.string();
const headers = z.record(z.string(), z.string()).nullable();
const status = z.enum(['pending', 'completed']);
const responseStatus = z.number().int().min(-2147483648).max(2147483647).nullable();
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]).nullable();
const ttlSeconds = z.number().int().min(1).max(2147483647);
const durableRow = z.object({
 request_fingerprint: text.nullable(),
 response: z.object({ body: z.json().optional(), statusCode: z.number().finite().optional() }).catchall(z.json()).nullable(),
 response_headers: headers, status, expires_at: timestamp,
});
const commandRow = z.object({ request_fingerprint: text.nullable(), status, response_status: responseStatus, response_bytes: z.instanceof(Buffer).nullable(), response_headers: headers });

export const lookupDurable = defineQuery({
 name: 'idempotency.lookupDurable',
 text: sql`
              select request_fingerprint, response, response_headers, status, expires_at
              from core.idempotency_keys
              where tenant_id is not distinct from $1::uuid
                and key = $2
                and coalesce(expires_at, clock_timestamp() + interval '1 second') > clock_timestamp()
              limit 1
            `,
 params: z.tuple([uuid.nullable(), text]), row: durableRow, expects: 'zero-or-one',
});

export const reserveDurable = defineQuery({
 name: 'idempotency.reserveDurable',
 text: sql`
              insert into core.idempotency_keys (
                tenant_id,
                key,
                status,
                request_fingerprint,
                expires_at,
                updated_at
              )
              values ($1::uuid, $2, 'pending', $3, clock_timestamp() + make_interval(secs => $4::int), clock_timestamp())
              on conflict (tenant_id, key) do nothing
              returning 1 as reserved
            `,
 params: z.tuple([uuid.nullable(), text, text, ttlSeconds]), row: z.object({ reserved: z.literal(1) }), expects: 'zero-or-one',
});

export const completeDurable = defineQuery({
 name: 'idempotency.completeDurable',
 text: sql`
              update core.idempotency_keys
                 set status = 'completed',
                     response = $3::jsonb,
                     response_headers = $4::jsonb,
                     expires_at = clock_timestamp() + make_interval(secs => $5::int),
                     updated_at = clock_timestamp()
               where tenant_id is not distinct from $1::uuid
                 and key = $2
            `,
 params: z.tuple([uuid.nullable(), text, text, text, ttlSeconds]), row: z.object({}), expects: 'none',
});

export const clearDurable = defineQuery({
 name: 'idempotency.clearDurable',
 text: sql`
              delete from core.idempotency_keys
              where tenant_id is not distinct from $1::uuid
                and key = $2
                and status = 'pending'
            `,
 params: z.tuple([uuid.nullable(), text]), row: z.object({}), expects: 'none',
});

export const lookupCommand = defineQuery({
 name: 'idempotency.lookupCommand',
 text: sql`
      select request_fingerprint, status, response_status, response_bytes, response_headers
        from core.idempotency_keys
       where tenant_id = $1::uuid and key = $2
         and expires_at > clock_timestamp()
       limit 1`,
 params: z.tuple([uuid, text]), row: commandRow, expects: 'zero-or-one',
});

export const reserveCommand = defineQuery({
 name: 'idempotency.reserveCommand',
 text: sql`
      insert into core.idempotency_keys
        (tenant_id, key, status, request_fingerprint, expires_at, updated_at)
      values ($1::uuid, $2, 'pending', $3, clock_timestamp() + $4::interval, clock_timestamp())
      on conflict (tenant_id, key) do update
        set status = 'pending', request_fingerprint = excluded.request_fingerprint,
            response = null, response_status = null, response_bytes = null,
            response_headers = null, expires_at = excluded.expires_at,
            updated_at = clock_timestamp()
        where core.idempotency_keys.expires_at <= clock_timestamp()
      returning id`,
 params: z.tuple([uuid, text, text, text.regex(/^\d+ seconds$/u)]), row: z.object({ id: uuid }), expects: 'zero-or-one',
});

export const completeCommand = defineQuery({
 name: 'idempotency.completeCommand',
 text: sql`
      update core.idempotency_keys
         set status = 'completed', response_status = $3, response_bytes = $4,
             response_headers = $5::jsonb, updated_at = clock_timestamp()
       where tenant_id = $1::uuid and key = $2
         and status = 'pending' and request_fingerprint = $6`,
 params: z.tuple([uuid, text, z.number().int().min(-2147483648).max(2147483647), z.instanceof(Buffer).nullable(), text, text]), row: z.object({}), expects: 'none',
});

export const clearCommand = defineQuery({
 name: 'idempotency.clearCommand',
 text: sql`
      delete from core.idempotency_keys
       where tenant_id = $1::uuid and key = $2
         and status = 'pending' and request_fingerprint = $3`,
 params: z.tuple([uuid, text, text]), row: z.object({}), expects: 'none',
});

export const readLockTimeout = defineQuery({
 name: 'idempotency.readLockTimeout',
 text: sql`select current_setting('lock_timeout', true) as timeout`,
 params: z.tuple([]), row: z.object({ timeout: text.nullable() }), expects: 'zero-or-one',
});

export const setLockTimeout = defineQuery({
 name: 'idempotency.setLockTimeout',
 text: sql`select set_config('lock_timeout', $1, true)`,
 params: z.tuple([text]), row: z.object({ set_config: text }), expects: 'zero-or-one',
});

