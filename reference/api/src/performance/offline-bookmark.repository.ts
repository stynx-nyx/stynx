import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import { uuid } from '../query-schemas.js';

export const bookmarkTransactionIdentityQuery = defineQuery({
  name: 'reference.offline.bookmark-transaction',
  text: sql`select current_user::text as sql_role,
      current_setting('app.role',true) as role,
      current_setting('app.tenant_id',true) as tenant,
      current_setting('app.actor_id',true) as actor,
      current_setting('transaction_isolation') as isolation,
      current_setting('transaction_read_only') as readonly,
      pg_current_xact_id()::text as transaction_id`,
  params: z.tuple([]),
  row: z.object({
    sql_role: z.string(), role: z.string().nullable(), tenant: z.string().nullable(),
    actor: z.string().nullable(), isolation: z.string(), readonly: z.string(), transaction_id: z.string(),
  }),
  expects: 'one',
});

export const bookmarkReceiptAttemptsQuery = defineQuery({
  name: 'reference.offline.bookmark-receipt-attempts',
  text: sql`select (context_json->'stynx'->>'attempts')::integer as attempts
       from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, z.string()]),
  row: z.object({ attempts: z.number().int().nullable() }),
  expects: 'zero-or-one',
});

export const insertOfflineBookmarkQuery = defineQuery({
  name: 'reference.offline.bookmark-insert',
  text: sql`insert into demo.demo__bookmark_bookmark
             (id,tenant_id,owner_id,url,title,notes,created_at,updated_at)
             values($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::timestamptz,$7::timestamptz)
             returning id::text`,
  params: z.tuple([
    uuid, uuid, uuid, z.string(), z.string().nullable(), z.string().nullable(),
    z.string().refine((value) => Number.isFinite(Date.parse(value))),
  ]),
  row: z.object({ id: uuid }), expects: 'zero-or-one',
});
