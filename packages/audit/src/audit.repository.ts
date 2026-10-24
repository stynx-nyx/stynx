import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();
const nullableText = text.nullable();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const jsonObject = z.record(text, z.json());

export const writeCommandAudit = defineQuery({
 name: 'audit.writeCommandAudit', text: sql`SELECT audit.write_command_event(
        $1::text, $2::text, $3::text, $4::jsonb,
        $5::text, $6::text, $7::text,
        $8::jsonb, $9::jsonb, $10::jsonb
      )`,
 params: z.tuple([text, text, nullableText, text, nullableText, nullableText, nullableText, nullableText, nullableText, nullableText]), row: z.object({ write_command_event: z.literal('') }), expects: 'one',
});

export const writeLegacyAudit = defineQuery({
 name: 'audit.writeLegacyAudit', text: sql`SELECT audit.write(
         $1::uuid,
         $2::uuid,
         $3::text,
         $4::text,
         $5::text,
         $6::text,
         $7::jsonb,
         $8::text,
         $9::text,
         $10::text,
         $11::jsonb,
         $12::jsonb,
         $13::jsonb
       )`,
 params: z.tuple([uuid.nullable(), uuid.nullable(), nullableText, text, text, nullableText, text, nullableText, nullableText, nullableText, nullableText, nullableText, nullableText]), row: z.object({ write: z.literal('') }), expects: 'one',
});

export const findAuditRowsQuery = defineQuery({
 name: 'audit.findAuditRows', text: sql`
      select id, table_schema, table_name, row_id, operation, tags
      from audit.log
      where operation = $1
        and ($2::text is null or table_schema = $2)
        and ($3::text is null or table_name = $3)
        and ($4::text is null or row_id = $4)
      order by occurred_at desc, id desc
    `,
 params: z.tuple([text, nullableText, nullableText, nullableText]),
 row: z.object({ id: z.union([text, z.number().finite()]), table_schema: text, table_name: text, row_id: nullableText, operation: text, tags: jsonObject.nullable() }), expects: 'many',
});

export const auditPartitions = defineQuery({
 name: 'audit.auditPartitions', text: sql`
            select child.relname as partition_name
            from pg_inherits inherits
            join pg_class parent on parent.oid = inherits.inhparent
            join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
            join pg_class child on child.oid = inherits.inhrelid
            where parent_ns.nspname = 'audit'
              and parent.relname = 'log'
            order by child.relname
          `,
 params: z.tuple([]), row: z.object({ partition_name: text }), expects: 'many',
});

export const auditChainRows = defineQuery({
 name: 'audit.auditChainRows', text: sql`
            select
              event_id::text as event_id,
              audit.format_hash_timestamp(occurred_at) as occurred_at_text,
              tenancy_id::text as tenancy_id_text,
              actor_id::text as actor_id_text,
              entity,
              entity_id,
              operation::text as operation_text,
              old_data::text as old_data_text,
              new_data::text as new_data_text,
              previous_hash,
              row_hash
            from audit.events
            where tenancy_id = $1::uuid
            order by occurred_at, event_id
            limit $2
          `,
 params: z.tuple([uuid, z.number().int().min(1).max(10000)]), row: z.object({ event_id: text, occurred_at_text: nullableText, tenancy_id_text: nullableText, actor_id_text: nullableText, entity: nullableText, entity_id: nullableText, operation_text: nullableText, old_data_text: nullableText, new_data_text: nullableText, previous_hash: nullableText, row_hash: text }), expects: 'many',
});

