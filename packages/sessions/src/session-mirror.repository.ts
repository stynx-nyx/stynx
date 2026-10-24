import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

export const ensureSessionsPartition = defineQuery({
 name: 'sessions.ensureSessionsPartition',
 text: sql`select auth.ensure_sessions_partition($1::timestamptz)`,
 params: z.tuple([z.string()]),
 row: z.object({ ensure_sessions_partition: z.string() }),
 expects: 'zero-or-one',
});
