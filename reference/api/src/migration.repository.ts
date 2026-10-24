import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

export const legacySampleTablesQuery = defineQuery({
  name: 'reference.migration.legacy-sample-tables',
  text: sql`
      select table_name
      from information_schema.tables
      where table_schema = 'sample'
        and table_name in ('record', 'record_note', 'work_item', 'work_item_entry', 'work_item_lock')
    `,
  params: z.tuple([]), row: z.object({ table_name: z.string() }), expects: 'many',
});

export const recordLegacyMigrationQuery = defineQuery({
  name: 'reference.migration.record-legacy',
  text: sql`
      insert into core.app_schema_migrations (scope, id, checksum, applied_at)
      values ($1, '0001_reference.sql', 'legacy-bootstrap', clock_timestamp())
      on conflict (scope, id) do nothing
    `,
  params: z.tuple([z.string()]), row: z.object({}), expects: 'none',
});

export const appliedReferenceMigrationsQuery = defineQuery({
  name: 'reference.migration.applied',
  text: sql`
        select id
        from core.app_schema_migrations
        where scope = $1
      `,
  params: z.tuple([z.string()]), row: z.object({ id: z.string() }), expects: 'many',
});

export const recordReferenceMigrationQuery = defineQuery({
  name: 'reference.migration.record',
  text: sql`
            insert into core.app_schema_migrations (scope, id, checksum, applied_at)
            values ($1, $2, md5($3), clock_timestamp())
            on conflict (scope, id) do nothing
          `,
  params: z.tuple([z.string(), z.string(), z.string()]), row: z.object({}), expects: 'none',
});
