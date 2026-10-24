import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const integer = z.number().int().min(-2147483648).max(2147483647);
const overrideRow = z.object({ limit_value: integer, window_seconds: integer });
const configValue = z.object({ limit: z.number().finite().optional(), windowSeconds: z.number().finite().optional() }).catchall(z.json());
export type OverrideRow = z.output<typeof overrideRow>;
export type ConfigValue = z.output<typeof configValue>;

export const rateLimitOverride = defineQuery({
 name: 'ratelimit.rateLimitOverride', text: sql`
              select limit_value, window_seconds
              from core.rate_limit_overrides
              where tenant_id = $1::uuid
                and scope = $2
              order by updated_at desc
              limit 1
            `,
 params: z.tuple([uuid, text]), row: overrideRow, expects: 'many',
});

export const rateLimitPlatformConfig = defineQuery({
 name: 'ratelimit.rateLimitPlatformConfig', text: sql`
                select value
                from core.config
                where key = $1
                  and tenant_id is null
                limit 1
              `,
 params: z.tuple([text]), row: z.object({ value: configValue.nullable() }), expects: 'many',
});

