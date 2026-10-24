import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

export const appliedMigrationIdsQuery = defineQuery({
  name: 'cli.migration.applied',
  text: sql`select id from core.schema_migrations order by id`,
  params: z.tuple([]),
  row: z.object({ id: z.string() }),
  expects: 'many',
});

export const latestAppliedIdsQuery = defineQuery({
  name: 'cli.migration.latest',
  text: sql`
      select id
      from core.schema_migrations
      order by applied_at desc, id desc
      limit $1
    `,
  params: z.tuple([z.number().int().nonnegative()]),
  row: z.object({ id: z.string() }),
  expects: 'many',
});

export const recordMigrationQuery = defineQuery({
  name: 'cli.migration.record',
  text: sql`
        insert into core.schema_migrations (id, checksum, applied_at)
        values ($1, $2, clock_timestamp())
        on conflict (id) do update set checksum = excluded.checksum, applied_at = excluded.applied_at
      `,
  params: z.tuple([z.string(), z.string()]),
  row: z.object({}),
  expects: 'none',
});

export const recordMigrationJournalQuery = defineQuery({
  name: 'cli.migration.journal',
  text: sql`insert into core.schema_migration_journal (id, checksum, direction) values ($1, $2, $3)`,
  params: z.tuple([z.string(), z.string(), z.enum(['up', 'down'])]),
  row: z.object({}),
  expects: 'none',
});

export const removeMigrationQuery = defineQuery({
  name: 'cli.migration.remove',
  text: sql`delete from core.schema_migrations where id = $1`,
  params: z.tuple([z.string()]),
  row: z.object({}),
  expects: 'none',
});
