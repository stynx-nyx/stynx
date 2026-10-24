import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);

export const setErasureStrategy = defineQuery({
 name: 'privacy.setErasureStrategy', text: sql`select set_config('app.erasure_strategy', $1, true)`,
 params: z.tuple([text]), row: z.object({ set_config: text }), expects: 'many',
});

export const readPiiRules = defineQuery({
 name: 'privacy.readPiiRules', text: sql`
              select
                table_schema,
                table_name,
                column_name,
                strategy,
                category,
                notes
              from core.pii_map
            `,
 params: z.tuple([]), row: z.object({ table_schema: text, table_name: text, column_name: text, strategy: text, category: text.nullable(), notes: text.nullable() }), expects: 'many',
});

export const expiredSessionPartitions = defineQuery({
 name: 'privacy.expiredSessionPartitions', text: sql`select partition_name, month_end::text as month_end, dropped from auth.drop_expired_sessions_partitions($1::boolean)`,
 params: z.tuple([z.boolean()]), row: z.object({ partition_name: text, month_end: text, dropped: z.boolean() }), expects: 'many',
});

export const privacyTenantMembership = defineQuery({
 name: 'privacy.privacyTenantMembership', text: sql`select exists (select 1 from auth.memberships where tenant_id = $1::uuid and user_id = $2::uuid and is_active = true) as allowed`,
 params: z.tuple([uuid, uuid]), row: z.object({ allowed: z.boolean() }), expects: 'many',
});

