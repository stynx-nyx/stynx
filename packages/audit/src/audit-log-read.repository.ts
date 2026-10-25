import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();
const timestamp = z.union([text, z.instanceof(Date),
  z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)]);
const opaque = z.custom<Record<string, unknown> | unknown[] | string | number | boolean>(
  (value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ||
    (typeof value === 'object' && value !== null),
);
const numeric = z.custom<number>((value) => typeof value === 'number');
const auditLogRow = z.object({
  id: z.union([text, numeric]), occurred_at: timestamp,
  table_schema: text, table_name: text, row_id: text.nullable(), operation: text,
  tenant_id: text.nullable(), actor_id: text.nullable(), request_id: text.nullable(),
  session_id: text.nullable(), tags: opaque.nullish(), payload: opaque.nullish(),
});
export type AuditLogReadRow = z.output<typeof auditLogRow>;
const auditLogParams0 = z.tuple([numeric]);
const auditLogParams0Cursor = z.tuple([z.unknown(), z.unknown(), numeric]);
const auditLogParams1 = z.tuple([text.optional(), numeric]);
const auditLogParams1Cursor = z.tuple([text.optional(), z.unknown(), z.unknown(), numeric]);
const auditLogParams2 = z.tuple([text.optional(), text.optional(), numeric]);
const auditLogParams2Cursor = z.tuple([text.optional(), text.optional(), z.unknown(), z.unknown(), numeric]);
const auditLogParams3 = z.tuple([text.optional(), text.optional(), text.optional(), numeric]);
const auditLogParams3Cursor = z.tuple([text.optional(), text.optional(), text.optional(), z.unknown(), z.unknown(), numeric]);
const auditLogParams4 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), numeric]);
const auditLogParams4Cursor = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), z.unknown(), z.unknown(), numeric]);
const auditLogParams5 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), numeric]);
const auditLogParams5Cursor = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), z.unknown(), z.unknown(), numeric]);
const auditLogParams6 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), numeric]);
const auditLogParams6Cursor = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), z.unknown(), z.unknown(), numeric]);
const auditLogParams7 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), numeric]);
const auditLogParams7Cursor = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), z.unknown(), z.unknown(), numeric]);

export const auditLogRead0 = defineQuery({
 name: 'audit.listLog.mask.0', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            
            order by occurred_at desc, id desc
            limit $1
          `,
 params: auditLogParams0, row: auditLogRow, expects: 'many',
});
export const auditLogRead1 = defineQuery({
 name: 'audit.listLog.mask.1', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1
            order by occurred_at desc, id desc
            limit $2
          `,
 params: auditLogParams1, row: auditLogRow, expects: 'many',
});
export const auditLogRead2 = defineQuery({
 name: 'audit.listLog.mask.2', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1
            order by occurred_at desc, id desc
            limit $2
          `,
 params: auditLogParams1, row: auditLogRow, expects: 'many',
});
export const auditLogRead3 = defineQuery({
 name: 'audit.listLog.mask.3', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead4 = defineQuery({
 name: 'audit.listLog.mask.4', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1
            order by occurred_at desc, id desc
            limit $2
          `,
 params: auditLogParams1, row: auditLogRow, expects: 'many',
});
export const auditLogRead5 = defineQuery({
 name: 'audit.listLog.mask.5', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead6 = defineQuery({
 name: 'audit.listLog.mask.6', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead7 = defineQuery({
 name: 'audit.listLog.mask.7', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead8 = defineQuery({
 name: 'audit.listLog.mask.8', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1
            order by occurred_at desc, id desc
            limit $2
          `,
 params: auditLogParams1, row: auditLogRow, expects: 'many',
});
export const auditLogRead9 = defineQuery({
 name: 'audit.listLog.mask.9', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead10 = defineQuery({
 name: 'audit.listLog.mask.10', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead11 = defineQuery({
 name: 'audit.listLog.mask.11', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead12 = defineQuery({
 name: 'audit.listLog.mask.12', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead13 = defineQuery({
 name: 'audit.listLog.mask.13', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead14 = defineQuery({
 name: 'audit.listLog.mask.14', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead15 = defineQuery({
 name: 'audit.listLog.mask.15', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead16 = defineQuery({
 name: 'audit.listLog.mask.16', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where row_id = $1
            order by occurred_at desc, id desc
            limit $2
          `,
 params: auditLogParams1, row: auditLogRow, expects: 'many',
});
export const auditLogRead17 = defineQuery({
 name: 'audit.listLog.mask.17', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and row_id = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead18 = defineQuery({
 name: 'audit.listLog.mask.18', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and row_id = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead19 = defineQuery({
 name: 'audit.listLog.mask.19', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and row_id = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead20 = defineQuery({
 name: 'audit.listLog.mask.20', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and row_id = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead21 = defineQuery({
 name: 'audit.listLog.mask.21', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and row_id = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead22 = defineQuery({
 name: 'audit.listLog.mask.22', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and row_id = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead23 = defineQuery({
 name: 'audit.listLog.mask.23', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and row_id = $4
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead24 = defineQuery({
 name: 'audit.listLog.mask.24', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and row_id = $2
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead25 = defineQuery({
 name: 'audit.listLog.mask.25', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and row_id = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead26 = defineQuery({
 name: 'audit.listLog.mask.26', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and row_id = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead27 = defineQuery({
 name: 'audit.listLog.mask.27', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and row_id = $4
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead28 = defineQuery({
 name: 'audit.listLog.mask.28', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and row_id = $3
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead29 = defineQuery({
 name: 'audit.listLog.mask.29', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead30 = defineQuery({
 name: 'audit.listLog.mask.30', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead31 = defineQuery({
 name: 'audit.listLog.mask.31', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and row_id = $5
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead32 = defineQuery({
 name: 'audit.listLog.mask.32', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where occurred_at >= $1::timestamptz
            order by occurred_at desc, id desc
            limit $2
          `,
 params: auditLogParams1, row: auditLogRow, expects: 'many',
});
export const auditLogRead33 = defineQuery({
 name: 'audit.listLog.mask.33', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and occurred_at >= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead34 = defineQuery({
 name: 'audit.listLog.mask.34', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and occurred_at >= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead35 = defineQuery({
 name: 'audit.listLog.mask.35', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead36 = defineQuery({
 name: 'audit.listLog.mask.36', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and occurred_at >= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead37 = defineQuery({
 name: 'audit.listLog.mask.37', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead38 = defineQuery({
 name: 'audit.listLog.mask.38', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead39 = defineQuery({
 name: 'audit.listLog.mask.39', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead40 = defineQuery({
 name: 'audit.listLog.mask.40', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and occurred_at >= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead41 = defineQuery({
 name: 'audit.listLog.mask.41', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead42 = defineQuery({
 name: 'audit.listLog.mask.42', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead43 = defineQuery({
 name: 'audit.listLog.mask.43', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead44 = defineQuery({
 name: 'audit.listLog.mask.44', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead45 = defineQuery({
 name: 'audit.listLog.mask.45', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead46 = defineQuery({
 name: 'audit.listLog.mask.46', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead47 = defineQuery({
 name: 'audit.listLog.mask.47', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and occurred_at >= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead48 = defineQuery({
 name: 'audit.listLog.mask.48', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where row_id = $1 and occurred_at >= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead49 = defineQuery({
 name: 'audit.listLog.mask.49', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and row_id = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead50 = defineQuery({
 name: 'audit.listLog.mask.50', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and row_id = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead51 = defineQuery({
 name: 'audit.listLog.mask.51', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and row_id = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead52 = defineQuery({
 name: 'audit.listLog.mask.52', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and row_id = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead53 = defineQuery({
 name: 'audit.listLog.mask.53', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead54 = defineQuery({
 name: 'audit.listLog.mask.54', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead55 = defineQuery({
 name: 'audit.listLog.mask.55', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and row_id = $4 and occurred_at >= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead56 = defineQuery({
 name: 'audit.listLog.mask.56', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and row_id = $2 and occurred_at >= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead57 = defineQuery({
 name: 'audit.listLog.mask.57', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead58 = defineQuery({
 name: 'audit.listLog.mask.58', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead59 = defineQuery({
 name: 'audit.listLog.mask.59', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead60 = defineQuery({
 name: 'audit.listLog.mask.60', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead61 = defineQuery({
 name: 'audit.listLog.mask.61', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead62 = defineQuery({
 name: 'audit.listLog.mask.62', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead63 = defineQuery({
 name: 'audit.listLog.mask.63', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and row_id = $5 and occurred_at >= $6::timestamptz
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams6, row: auditLogRow, expects: 'many',
});
export const auditLogRead64 = defineQuery({
 name: 'audit.listLog.mask.64', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where occurred_at <= $1::timestamptz
            order by occurred_at desc, id desc
            limit $2
          `,
 params: auditLogParams1, row: auditLogRow, expects: 'many',
});
export const auditLogRead65 = defineQuery({
 name: 'audit.listLog.mask.65', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and occurred_at <= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead66 = defineQuery({
 name: 'audit.listLog.mask.66', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and occurred_at <= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead67 = defineQuery({
 name: 'audit.listLog.mask.67', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead68 = defineQuery({
 name: 'audit.listLog.mask.68', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and occurred_at <= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead69 = defineQuery({
 name: 'audit.listLog.mask.69', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead70 = defineQuery({
 name: 'audit.listLog.mask.70', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead71 = defineQuery({
 name: 'audit.listLog.mask.71', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead72 = defineQuery({
 name: 'audit.listLog.mask.72', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and occurred_at <= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead73 = defineQuery({
 name: 'audit.listLog.mask.73', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead74 = defineQuery({
 name: 'audit.listLog.mask.74', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead75 = defineQuery({
 name: 'audit.listLog.mask.75', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead76 = defineQuery({
 name: 'audit.listLog.mask.76', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead77 = defineQuery({
 name: 'audit.listLog.mask.77', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead78 = defineQuery({
 name: 'audit.listLog.mask.78', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead79 = defineQuery({
 name: 'audit.listLog.mask.79', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead80 = defineQuery({
 name: 'audit.listLog.mask.80', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where row_id = $1 and occurred_at <= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead81 = defineQuery({
 name: 'audit.listLog.mask.81', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and row_id = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead82 = defineQuery({
 name: 'audit.listLog.mask.82', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and row_id = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead83 = defineQuery({
 name: 'audit.listLog.mask.83', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and row_id = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead84 = defineQuery({
 name: 'audit.listLog.mask.84', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and row_id = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead85 = defineQuery({
 name: 'audit.listLog.mask.85', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead86 = defineQuery({
 name: 'audit.listLog.mask.86', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead87 = defineQuery({
 name: 'audit.listLog.mask.87', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and row_id = $4 and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead88 = defineQuery({
 name: 'audit.listLog.mask.88', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and row_id = $2 and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead89 = defineQuery({
 name: 'audit.listLog.mask.89', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead90 = defineQuery({
 name: 'audit.listLog.mask.90', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead91 = defineQuery({
 name: 'audit.listLog.mask.91', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and row_id = $4 and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead92 = defineQuery({
 name: 'audit.listLog.mask.92', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and row_id = $3 and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead93 = defineQuery({
 name: 'audit.listLog.mask.93', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead94 = defineQuery({
 name: 'audit.listLog.mask.94', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead95 = defineQuery({
 name: 'audit.listLog.mask.95', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and row_id = $5 and occurred_at <= $6::timestamptz
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams6, row: auditLogRow, expects: 'many',
});
export const auditLogRead96 = defineQuery({
 name: 'audit.listLog.mask.96', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where occurred_at >= $1::timestamptz and occurred_at <= $2::timestamptz
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams2, row: auditLogRow, expects: 'many',
});
export const auditLogRead97 = defineQuery({
 name: 'audit.listLog.mask.97', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead98 = defineQuery({
 name: 'audit.listLog.mask.98', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead99 = defineQuery({
 name: 'audit.listLog.mask.99', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead100 = defineQuery({
 name: 'audit.listLog.mask.100', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead101 = defineQuery({
 name: 'audit.listLog.mask.101', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead102 = defineQuery({
 name: 'audit.listLog.mask.102', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead103 = defineQuery({
 name: 'audit.listLog.mask.103', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead104 = defineQuery({
 name: 'audit.listLog.mask.104', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead105 = defineQuery({
 name: 'audit.listLog.mask.105', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead106 = defineQuery({
 name: 'audit.listLog.mask.106', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead107 = defineQuery({
 name: 'audit.listLog.mask.107', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead108 = defineQuery({
 name: 'audit.listLog.mask.108', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead109 = defineQuery({
 name: 'audit.listLog.mask.109', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead110 = defineQuery({
 name: 'audit.listLog.mask.110', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead111 = defineQuery({
 name: 'audit.listLog.mask.111', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams6, row: auditLogRow, expects: 'many',
});
export const auditLogRead112 = defineQuery({
 name: 'audit.listLog.mask.112', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where row_id = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams3, row: auditLogRow, expects: 'many',
});
export const auditLogRead113 = defineQuery({
 name: 'audit.listLog.mask.113', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and row_id = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead114 = defineQuery({
 name: 'audit.listLog.mask.114', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and row_id = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead115 = defineQuery({
 name: 'audit.listLog.mask.115', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead116 = defineQuery({
 name: 'audit.listLog.mask.116', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and row_id = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead117 = defineQuery({
 name: 'audit.listLog.mask.117', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead118 = defineQuery({
 name: 'audit.listLog.mask.118', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead119 = defineQuery({
 name: 'audit.listLog.mask.119', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and row_id = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams6, row: auditLogRow, expects: 'many',
});
export const auditLogRead120 = defineQuery({
 name: 'audit.listLog.mask.120', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and row_id = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams4, row: auditLogRow, expects: 'many',
});
export const auditLogRead121 = defineQuery({
 name: 'audit.listLog.mask.121', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead122 = defineQuery({
 name: 'audit.listLog.mask.122', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead123 = defineQuery({
 name: 'audit.listLog.mask.123', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams6, row: auditLogRow, expects: 'many',
});
export const auditLogRead124 = defineQuery({
 name: 'audit.listLog.mask.124', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams5, row: auditLogRow, expects: 'many',
});
export const auditLogRead125 = defineQuery({
 name: 'audit.listLog.mask.125', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams6, row: auditLogRow, expects: 'many',
});
export const auditLogRead126 = defineQuery({
 name: 'audit.listLog.mask.126', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams6, row: auditLogRow, expects: 'many',
});
export const auditLogRead127 = defineQuery({
 name: 'audit.listLog.mask.127', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and row_id = $5 and occurred_at >= $6::timestamptz and occurred_at <= $7::timestamptz
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams7, row: auditLogRow, expects: 'many',
});
export const auditLogRead128 = defineQuery({
 name: 'audit.listLog.mask.128', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where (occurred_at, id) < ($1::timestamptz, $2::bigint)
            order by occurred_at desc, id desc
            limit $3
          `,
 params: auditLogParams0Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead129 = defineQuery({
 name: 'audit.listLog.mask.129', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and (occurred_at, id) < ($2::timestamptz, $3::bigint)
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams1Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead130 = defineQuery({
 name: 'audit.listLog.mask.130', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and (occurred_at, id) < ($2::timestamptz, $3::bigint)
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams1Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead131 = defineQuery({
 name: 'audit.listLog.mask.131', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead132 = defineQuery({
 name: 'audit.listLog.mask.132', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and (occurred_at, id) < ($2::timestamptz, $3::bigint)
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams1Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead133 = defineQuery({
 name: 'audit.listLog.mask.133', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead134 = defineQuery({
 name: 'audit.listLog.mask.134', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead135 = defineQuery({
 name: 'audit.listLog.mask.135', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead136 = defineQuery({
 name: 'audit.listLog.mask.136', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and (occurred_at, id) < ($2::timestamptz, $3::bigint)
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams1Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead137 = defineQuery({
 name: 'audit.listLog.mask.137', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead138 = defineQuery({
 name: 'audit.listLog.mask.138', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead139 = defineQuery({
 name: 'audit.listLog.mask.139', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead140 = defineQuery({
 name: 'audit.listLog.mask.140', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead141 = defineQuery({
 name: 'audit.listLog.mask.141', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead142 = defineQuery({
 name: 'audit.listLog.mask.142', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead143 = defineQuery({
 name: 'audit.listLog.mask.143', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead144 = defineQuery({
 name: 'audit.listLog.mask.144', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where row_id = $1 and (occurred_at, id) < ($2::timestamptz, $3::bigint)
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams1Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead145 = defineQuery({
 name: 'audit.listLog.mask.145', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and row_id = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead146 = defineQuery({
 name: 'audit.listLog.mask.146', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and row_id = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead147 = defineQuery({
 name: 'audit.listLog.mask.147', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and row_id = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead148 = defineQuery({
 name: 'audit.listLog.mask.148', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and row_id = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead149 = defineQuery({
 name: 'audit.listLog.mask.149', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and row_id = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead150 = defineQuery({
 name: 'audit.listLog.mask.150', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and row_id = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead151 = defineQuery({
 name: 'audit.listLog.mask.151', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and row_id = $4 and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead152 = defineQuery({
 name: 'audit.listLog.mask.152', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and row_id = $2 and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead153 = defineQuery({
 name: 'audit.listLog.mask.153', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and row_id = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead154 = defineQuery({
 name: 'audit.listLog.mask.154', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and row_id = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead155 = defineQuery({
 name: 'audit.listLog.mask.155', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and row_id = $4 and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead156 = defineQuery({
 name: 'audit.listLog.mask.156', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and row_id = $3 and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead157 = defineQuery({
 name: 'audit.listLog.mask.157', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead158 = defineQuery({
 name: 'audit.listLog.mask.158', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead159 = defineQuery({
 name: 'audit.listLog.mask.159', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and row_id = $5 and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead160 = defineQuery({
 name: 'audit.listLog.mask.160', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where occurred_at >= $1::timestamptz and (occurred_at, id) < ($2::timestamptz, $3::bigint)
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams1Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead161 = defineQuery({
 name: 'audit.listLog.mask.161', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and occurred_at >= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead162 = defineQuery({
 name: 'audit.listLog.mask.162', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and occurred_at >= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead163 = defineQuery({
 name: 'audit.listLog.mask.163', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead164 = defineQuery({
 name: 'audit.listLog.mask.164', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and occurred_at >= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead165 = defineQuery({
 name: 'audit.listLog.mask.165', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead166 = defineQuery({
 name: 'audit.listLog.mask.166', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead167 = defineQuery({
 name: 'audit.listLog.mask.167', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead168 = defineQuery({
 name: 'audit.listLog.mask.168', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and occurred_at >= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead169 = defineQuery({
 name: 'audit.listLog.mask.169', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead170 = defineQuery({
 name: 'audit.listLog.mask.170', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead171 = defineQuery({
 name: 'audit.listLog.mask.171', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead172 = defineQuery({
 name: 'audit.listLog.mask.172', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead173 = defineQuery({
 name: 'audit.listLog.mask.173', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead174 = defineQuery({
 name: 'audit.listLog.mask.174', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead175 = defineQuery({
 name: 'audit.listLog.mask.175', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and occurred_at >= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead176 = defineQuery({
 name: 'audit.listLog.mask.176', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where row_id = $1 and occurred_at >= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead177 = defineQuery({
 name: 'audit.listLog.mask.177', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and row_id = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead178 = defineQuery({
 name: 'audit.listLog.mask.178', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and row_id = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead179 = defineQuery({
 name: 'audit.listLog.mask.179', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and row_id = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead180 = defineQuery({
 name: 'audit.listLog.mask.180', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and row_id = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead181 = defineQuery({
 name: 'audit.listLog.mask.181', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead182 = defineQuery({
 name: 'audit.listLog.mask.182', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead183 = defineQuery({
 name: 'audit.listLog.mask.183', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and row_id = $4 and occurred_at >= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead184 = defineQuery({
 name: 'audit.listLog.mask.184', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and row_id = $2 and occurred_at >= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead185 = defineQuery({
 name: 'audit.listLog.mask.185', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead186 = defineQuery({
 name: 'audit.listLog.mask.186', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead187 = defineQuery({
 name: 'audit.listLog.mask.187', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead188 = defineQuery({
 name: 'audit.listLog.mask.188', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead189 = defineQuery({
 name: 'audit.listLog.mask.189', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead190 = defineQuery({
 name: 'audit.listLog.mask.190', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead191 = defineQuery({
 name: 'audit.listLog.mask.191', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and row_id = $5 and occurred_at >= $6::timestamptz and (occurred_at, id) < ($7::timestamptz, $8::bigint)
            order by occurred_at desc, id desc
            limit $9
          `,
 params: auditLogParams6Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead192 = defineQuery({
 name: 'audit.listLog.mask.192', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where occurred_at <= $1::timestamptz and (occurred_at, id) < ($2::timestamptz, $3::bigint)
            order by occurred_at desc, id desc
            limit $4
          `,
 params: auditLogParams1Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead193 = defineQuery({
 name: 'audit.listLog.mask.193', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and occurred_at <= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead194 = defineQuery({
 name: 'audit.listLog.mask.194', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and occurred_at <= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead195 = defineQuery({
 name: 'audit.listLog.mask.195', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead196 = defineQuery({
 name: 'audit.listLog.mask.196', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and occurred_at <= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead197 = defineQuery({
 name: 'audit.listLog.mask.197', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead198 = defineQuery({
 name: 'audit.listLog.mask.198', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead199 = defineQuery({
 name: 'audit.listLog.mask.199', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead200 = defineQuery({
 name: 'audit.listLog.mask.200', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and occurred_at <= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead201 = defineQuery({
 name: 'audit.listLog.mask.201', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead202 = defineQuery({
 name: 'audit.listLog.mask.202', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead203 = defineQuery({
 name: 'audit.listLog.mask.203', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead204 = defineQuery({
 name: 'audit.listLog.mask.204', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead205 = defineQuery({
 name: 'audit.listLog.mask.205', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead206 = defineQuery({
 name: 'audit.listLog.mask.206', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead207 = defineQuery({
 name: 'audit.listLog.mask.207', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead208 = defineQuery({
 name: 'audit.listLog.mask.208', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where row_id = $1 and occurred_at <= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead209 = defineQuery({
 name: 'audit.listLog.mask.209', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and row_id = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead210 = defineQuery({
 name: 'audit.listLog.mask.210', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and row_id = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead211 = defineQuery({
 name: 'audit.listLog.mask.211', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and row_id = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead212 = defineQuery({
 name: 'audit.listLog.mask.212', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and row_id = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead213 = defineQuery({
 name: 'audit.listLog.mask.213', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead214 = defineQuery({
 name: 'audit.listLog.mask.214', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead215 = defineQuery({
 name: 'audit.listLog.mask.215', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and row_id = $4 and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead216 = defineQuery({
 name: 'audit.listLog.mask.216', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and row_id = $2 and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead217 = defineQuery({
 name: 'audit.listLog.mask.217', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead218 = defineQuery({
 name: 'audit.listLog.mask.218', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead219 = defineQuery({
 name: 'audit.listLog.mask.219', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and row_id = $4 and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead220 = defineQuery({
 name: 'audit.listLog.mask.220', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and row_id = $3 and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead221 = defineQuery({
 name: 'audit.listLog.mask.221', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead222 = defineQuery({
 name: 'audit.listLog.mask.222', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead223 = defineQuery({
 name: 'audit.listLog.mask.223', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and row_id = $5 and occurred_at <= $6::timestamptz and (occurred_at, id) < ($7::timestamptz, $8::bigint)
            order by occurred_at desc, id desc
            limit $9
          `,
 params: auditLogParams6Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead224 = defineQuery({
 name: 'audit.listLog.mask.224', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where occurred_at >= $1::timestamptz and occurred_at <= $2::timestamptz and (occurred_at, id) < ($3::timestamptz, $4::bigint)
            order by occurred_at desc, id desc
            limit $5
          `,
 params: auditLogParams2Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead225 = defineQuery({
 name: 'audit.listLog.mask.225', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead226 = defineQuery({
 name: 'audit.listLog.mask.226', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead227 = defineQuery({
 name: 'audit.listLog.mask.227', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead228 = defineQuery({
 name: 'audit.listLog.mask.228', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead229 = defineQuery({
 name: 'audit.listLog.mask.229', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead230 = defineQuery({
 name: 'audit.listLog.mask.230', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead231 = defineQuery({
 name: 'audit.listLog.mask.231', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead232 = defineQuery({
 name: 'audit.listLog.mask.232', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead233 = defineQuery({
 name: 'audit.listLog.mask.233', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead234 = defineQuery({
 name: 'audit.listLog.mask.234', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead235 = defineQuery({
 name: 'audit.listLog.mask.235', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead236 = defineQuery({
 name: 'audit.listLog.mask.236', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead237 = defineQuery({
 name: 'audit.listLog.mask.237', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead238 = defineQuery({
 name: 'audit.listLog.mask.238', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead239 = defineQuery({
 name: 'audit.listLog.mask.239', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz and (occurred_at, id) < ($7::timestamptz, $8::bigint)
            order by occurred_at desc, id desc
            limit $9
          `,
 params: auditLogParams6Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead240 = defineQuery({
 name: 'audit.listLog.mask.240', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where row_id = $1 and occurred_at >= $2::timestamptz and occurred_at <= $3::timestamptz and (occurred_at, id) < ($4::timestamptz, $5::bigint)
            order by occurred_at desc, id desc
            limit $6
          `,
 params: auditLogParams3Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead241 = defineQuery({
 name: 'audit.listLog.mask.241', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and row_id = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead242 = defineQuery({
 name: 'audit.listLog.mask.242', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and row_id = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead243 = defineQuery({
 name: 'audit.listLog.mask.243', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead244 = defineQuery({
 name: 'audit.listLog.mask.244', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and row_id = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead245 = defineQuery({
 name: 'audit.listLog.mask.245', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead246 = defineQuery({
 name: 'audit.listLog.mask.246', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead247 = defineQuery({
 name: 'audit.listLog.mask.247', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and row_id = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz and (occurred_at, id) < ($7::timestamptz, $8::bigint)
            order by occurred_at desc, id desc
            limit $9
          `,
 params: auditLogParams6Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead248 = defineQuery({
 name: 'audit.listLog.mask.248', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_name = $1 and row_id = $2 and occurred_at >= $3::timestamptz and occurred_at <= $4::timestamptz and (occurred_at, id) < ($5::timestamptz, $6::bigint)
            order by occurred_at desc, id desc
            limit $7
          `,
 params: auditLogParams4Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead249 = defineQuery({
 name: 'audit.listLog.mask.249', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead250 = defineQuery({
 name: 'audit.listLog.mask.250', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead251 = defineQuery({
 name: 'audit.listLog.mask.251', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz and (occurred_at, id) < ($7::timestamptz, $8::bigint)
            order by occurred_at desc, id desc
            limit $9
          `,
 params: auditLogParams6Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead252 = defineQuery({
 name: 'audit.listLog.mask.252', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where table_schema = $1 and table_name = $2 and row_id = $3 and occurred_at >= $4::timestamptz and occurred_at <= $5::timestamptz and (occurred_at, id) < ($6::timestamptz, $7::bigint)
            order by occurred_at desc, id desc
            limit $8
          `,
 params: auditLogParams5Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead253 = defineQuery({
 name: 'audit.listLog.mask.253', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz and (occurred_at, id) < ($7::timestamptz, $8::bigint)
            order by occurred_at desc, id desc
            limit $9
          `,
 params: auditLogParams6Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead254 = defineQuery({
 name: 'audit.listLog.mask.254', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where actor_id::text = $1 and table_schema = $2 and table_name = $3 and row_id = $4 and occurred_at >= $5::timestamptz and occurred_at <= $6::timestamptz and (occurred_at, id) < ($7::timestamptz, $8::bigint)
            order by occurred_at desc, id desc
            limit $9
          `,
 params: auditLogParams6Cursor, row: auditLogRow, expects: 'many',
});
export const auditLogRead255 = defineQuery({
 name: 'audit.listLog.mask.255', text: sql`
            select
              id,
              occurred_at,
              table_schema,
              table_name,
              row_id,
              operation,
              tenant_id,
              actor_id,
              request_id,
              session_id,
              tags,
              payload
            from audit.log
            where tenant_id::text = $1 and actor_id::text = $2 and table_schema = $3 and table_name = $4 and row_id = $5 and occurred_at >= $6::timestamptz and occurred_at <= $7::timestamptz and (occurred_at, id) < ($8::timestamptz, $9::bigint)
            order by occurred_at desc, id desc
            limit $10
          `,
 params: auditLogParams7Cursor, row: auditLogRow, expects: 'many',
});
