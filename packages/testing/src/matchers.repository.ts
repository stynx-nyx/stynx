import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

export const auditRowsQuery = defineQuery({
  name: 'testing.matcher.audit',
  text: sql`
            select tags
            from audit.log
            where operation = $1
              and ($2::text is null or table_schema = $2)
              and table_name = $3
              and ($4::text is null or row_id = $4)
            order by occurred_at desc, id desc
          `,
  params: z.tuple([z.string(), z.string().nullable(), z.string(), z.string().nullable()]),
  row: z.object({ tags: z.record(z.string(), z.json()).nullable() }),
  expects: 'many',
});

export const archiveMirrorCountQuery = defineQuery({
  name: 'testing.matcher.archive-mirror',
  text: sql`
      select count(*)::int as value
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'archive'
        and c.relname = $1
    `,
  params: z.tuple([z.string()]),
  row: z.object({ value: z.number().int().nonnegative() }),
  expects: 'one',
});

export const archiveColumnsQuery = defineQuery({
  name: 'testing.matcher.archive-columns',
  text: sql`
            select column_name
            from information_schema.columns
            where table_schema = 'archive'
              and table_name = $1
          `,
  params: z.tuple([z.string()]),
  row: z.object({ column_name: z.string() }),
  expects: 'many',
});
