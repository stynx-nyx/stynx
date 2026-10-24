import { z } from 'zod';
import { defineQuery, sql } from './typed-query.js';

export const appliedMigrations = defineQuery({
  name: 'data.migration.applied', text: sql`select id from core.schema_migrations`,
  params: z.tuple([]), row: z.object({ id: z.string() }), expects: 'many',
});
export const recordMigration = defineQuery({
  name: 'data.migration.record',
  text: sql`
              insert into core.schema_migrations (id, checksum, applied_at)
              values ($1, md5($2), clock_timestamp())
              on conflict (id) do nothing
            `,
  params: z.tuple([z.string(), z.string()]), row: z.object({}), expects: 'none',
});
