import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

export const enableRowSecurity = defineQuery({
 name: 'backend.enableRowSecurity', text: sql`SET row_security = on`,
 params: z.tuple([]), row: z.object({}), expects: 'none',
});
export const setSessionSetting = defineQuery({
 name: 'backend.setSessionSetting', text: sql`select set_config($1, $2, false)`,
 params: z.tuple([z.string(), z.string()]),
 row: z.object({ set_config: z.string() }), expects: 'one',
});
