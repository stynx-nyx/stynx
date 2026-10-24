import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);

export const readOverrideSettings = defineQuery({
 name: 'i18n.readOverrideSettings',
 text: sql`select settings from tenancy.tenant_settings where tenant_id = $1::uuid limit 1`,
 params: z.tuple([uuid]), row: z.object({ settings: z.record(text, z.json()).nullable() }), expects: 'many',
});
export const readTenantLocale = defineQuery({
 name: 'i18n.readTenantLocale',
 text: sql`select locale from tenancy.tenant_settings where tenant_id = $1::uuid limit 1`,
 params: z.tuple([uuid]), row: z.object({ locale: text.nullable() }), expects: 'many',
});
export const writeOverrideSettings = defineQuery({
 name: 'i18n.writeOverrideSettings', text: sql`
              insert into tenancy.tenant_settings (tenant_id, settings, updated_at)
              values ($1::uuid, $2::jsonb, clock_timestamp())
              on conflict (tenant_id)
              do update set settings = $2::jsonb, updated_at = clock_timestamp()
            `,
 params: z.tuple([uuid, text]), row: z.object({}), expects: 'none',
});
