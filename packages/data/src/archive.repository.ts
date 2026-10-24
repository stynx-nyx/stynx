import { z } from 'zod';
import { defineQuery, sql } from './typed-query.js';

const identifier = z.string().refine((value) => Buffer.byteLength(value, 'utf8') <= 63);
const registryRow = z.object({ parentSchema: z.string(), parentTable: z.string(), childSchema: z.string(), childTable: z.string(), fkConstraint: z.string(), behavior: z.enum(['hide','cascade','block']), childColumn: z.string() });

export const registryByParent = defineQuery({
  name: 'data.archive.registryByParent',
  text: sql`
      select
        registry.parent_schema as "parentSchema",
        registry.parent_table as "parentTable",
        registry.child_schema as "childSchema",
        registry.child_table as "childTable",
        registry.fk_constraint as "fkConstraint",
        registry.behavior as behavior,
        child_attribute.attname as "childColumn"
      from core.softdelete_fk_registry registry
      join pg_namespace child_namespace
        on child_namespace.nspname = registry.child_schema
      join pg_class child_class
        on child_class.relname = registry.child_table
       and child_class.relnamespace = child_namespace.oid
      join pg_constraint constraint_item
        on constraint_item.conname = registry.fk_constraint
       and constraint_item.conrelid = child_class.oid
      join pg_attribute child_attribute
        on child_attribute.attrelid = child_class.oid
       and child_attribute.attnum = constraint_item.conkey[1]
      where registry.parent_schema = $1
        and registry.parent_table = $2
    `,
  params: z.tuple([identifier, identifier]),
  row: registryRow,
  expects: 'many',
});

export const registryByChild = defineQuery({
  name: 'data.archive.registryByChild',
  text: sql`
      select
        registry.parent_schema as "parentSchema",
        registry.parent_table as "parentTable",
        registry.child_schema as "childSchema",
        registry.child_table as "childTable",
        registry.fk_constraint as "fkConstraint",
        registry.behavior as behavior,
        child_attribute.attname as "childColumn"
      from core.softdelete_fk_registry registry
      join pg_namespace child_namespace
        on child_namespace.nspname = registry.child_schema
      join pg_class child_class
        on child_class.relname = registry.child_table
       and child_class.relnamespace = child_namespace.oid
      join pg_constraint constraint_item
        on constraint_item.conname = registry.fk_constraint
       and constraint_item.conrelid = child_class.oid
      join pg_attribute child_attribute
        on child_attribute.attrelid = child_class.oid
       and child_attribute.attnum = constraint_item.conkey[1]
      where registry.child_schema = $1
        and registry.child_table = $2
    `,
  params: z.tuple([identifier, identifier]),
  row: registryRow,
  expects: 'many',
});

export const uniqueConstraints = defineQuery({
  name: 'data.archive.uniqueConstraints',
  text: sql`
      select
        constraint_item.conname as constraint_name,
        array_agg(attribute.attname order by attribute.attnum) as columns
      from pg_constraint constraint_item
      join pg_class table_class on table_class.oid = constraint_item.conrelid
      join pg_namespace namespace_item on namespace_item.oid = table_class.relnamespace
      join unnest(constraint_item.conkey) as key_items(attnum) on true
      join pg_attribute attribute
        on attribute.attrelid = table_class.oid
       and attribute.attnum = key_items.attnum
      where namespace_item.nspname = $1
        and table_class.relname = $2
        and constraint_item.contype in ('u', 'p')
      group by constraint_item.conname
    `,
  params: z.tuple([identifier, identifier]),
  row: z.object({ constraint_name: z.string(), columns: z.union([z.array(z.string()), z.string()]) }),
  expects: 'many',
});

export const columnNames = defineQuery({
  name: 'data.archive.columnNames',
  text: sql`
      select column_name
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
        and coalesce(is_generated, 'NEVER') <> 'ALWAYS'
      order by ordinal_position
    `,
  params: z.tuple([identifier, identifier]),
  row: z.object({ column_name: z.string() }),
  expects: 'many',
});

export const mirrorExists = defineQuery({
  name: 'data.archive.mirrorExists',
  text: sql`select to_regclass($1) is not null as exists`,
  params: z.tuple([z.string()]),
  row: z.object({ exists: z.boolean() }),
  expects: 'zero-or-one',
});

export const archiveMoveContext = defineQuery({ name: 'data.archive.move-context', text: sql`select set_config('app.archive_move', 'in_progress', true)`, params: z.tuple([]), row: z.object({ set_config: z.string() }), expects: 'zero-or-one' });
export const archiveSoftDeleteReason = defineQuery({ name: 'data.archive.soft-delete-reason', text: sql`select set_config('app.archive_reason', 'soft_delete', true)`, params: z.tuple([]), row: z.object({ set_config: z.string() }), expects: 'zero-or-one' });
export const archiveRestoreReason = defineQuery({ name: 'data.archive.restore-reason', text: sql`select set_config('app.archive_reason', 'restore', true)`, params: z.tuple([]), row: z.object({ set_config: z.string() }), expects: 'zero-or-one' });
export const archiveSize = defineQuery({ name: 'data.archive.size', text: sql`select pg_total_relation_size($1::regclass)::text as bytes`, params: z.tuple([z.string()]), row: z.object({ bytes: z.string() }), expects: 'zero-or-one' });
