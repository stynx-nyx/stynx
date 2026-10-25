import { z } from 'zod';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const integer = z.number().int().min(-2147483648).max(2147483647);
const ttlSeconds = z.number().int().min(1).max(2147483647);
const identifiers = z.strictObject({
  table: text, tenantColumn: text, keyColumn: text, fingerprintColumn: text,
  statusCodeColumn: text, bodyColumn: text, expiresAtColumn: text,
});
type IdempotencyIdentifiers = z.output<typeof identifiers>;

/** Identifier syntax only; quoted segments retain case and unquoted segments fold as PostgreSQL does. */
function quoteIdentifierPath(value: string): string {
  const parts: string[] = [];
  let offset = 0;
  const token = /"(?:[^"]|"")+"|[\p{L}_][\p{L}\p{N}_$]*/uy;
  while (offset < value.length) {
    token.lastIndex = offset;
    const matched = token.exec(value)?.[0];
    if (!matched) throw new TypeError('Invalid configured SQL identifier');
    const segment = matched.startsWith('"')
      ? matched.slice(1, -1).replaceAll('""', '"')
      : matched.replace(/[A-Z]/gu, (letter) => letter.toLowerCase());
    if (segment.includes('\0') || !segment.length) {
      throw new TypeError('Invalid configured SQL identifier');
    }
    parts.push(`"${segment.replaceAll('"', '""')}"`);
    offset += matched.length;
    if (offset === value.length) break;
    if (value[offset++] !== '.' || offset === value.length) throw new TypeError('Invalid configured SQL identifier');
  }
  if (!parts.length) throw new TypeError('Invalid configured SQL identifier');
  return parts.join('.');
}

function quoted(values: IdempotencyIdentifiers): IdempotencyIdentifiers {
  return {
    table: quoteIdentifierPath(values.table), tenantColumn: quoteIdentifierPath(values.tenantColumn),
    keyColumn: quoteIdentifierPath(values.keyColumn), fingerprintColumn: quoteIdentifierPath(values.fingerprintColumn),
    statusCodeColumn: quoteIdentifierPath(values.statusCodeColumn), bodyColumn: quoteIdentifierPath(values.bodyColumn),
    expiresAtColumn: quoteIdentifierPath(values.expiresAtColumn),
  };
}

const tableIdentifiers = z.strictObject({ schema: text.min(1), table: text.min(1) });

// Drizzle metadata already supplies individual identifiers, never identifier paths.
// Preserve its case and punctuation while quoting every embedded double quote.
function quoteTableIdentifier(value: string): string {
  if (!value.length || value.includes('\0')) throw new TypeError('Invalid configured SQL identifier');
  return `"${value.replaceAll('"', '""')}"`;
}

const foreignKeyIdentifiers = z.strictObject({
  sourceSchema: z.enum(['offline', 'outbox']), sourceTable: text.min(1), sourceColumns: z.array(text.min(1)).min(1),
  targetSchema: text.min(1), targetTable: text.min(1), targetColumns: z.array(text.min(1)).min(1),
}).refine((value) => value.sourceColumns.length === value.targetColumns.length, { path: ['targetColumns'] });

const tenantIdentifiers = z.strictObject({ schema: text.min(1), table: text.min(1), column: text.min(1) });

const importForeignKeyIdentifiers = foreignKeyIdentifiers.refine((value) => value.sourceSchema === 'offline', { path: ['sourceSchema'] });
const importOverlayParams = z.tuple([text, text, text, text, text, text, text, text, text, text, text, text, text]);
const importOverlayTables = new Set(['numbering_ranges', 'numbering_reservations', 'sync_queue_items', 'sync_conflicts', 'sync_batches', 'sync_batch_transport_keys', 'sync_item_receipts', 'sync_item_attempts', 'numbering_consumption', 'sync_conflict_evidence', 'sync_conflict_actions', 'numbering_reconciliations', 'numbering_reservation_scopes', 'sync_import_receipts']);
function importOverlayRelation(schema: string, table: string): string {
  return schema === 'offline' && importOverlayTables.has(table)
    ? quoteTableIdentifier(`stynx_import_view_${table}`)
    : `${quoteTableIdentifier(schema)}.${quoteTableIdentifier(table)}`;
}
const importOverlayPrefix = `with "stynx_import_view_numbering_ranges" as (select * from offline."numbering_ranges" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_ranges",$1::jsonb) incoming
      where not exists(select 1 from offline."numbering_ranges" existing where existing."id"=incoming."id")),"stynx_import_view_numbering_reservations" as (select * from offline."numbering_reservations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reservations",$2::jsonb) incoming
      where not exists(select 1 from offline."numbering_reservations" existing where existing."id"=incoming."id")),"stynx_import_view_sync_queue_items" as (select * from offline."sync_queue_items" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_queue_items",$3::jsonb) incoming
      where not exists(select 1 from offline."sync_queue_items" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_sync_conflicts" as (select * from offline."sync_conflicts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflicts",$4::jsonb) incoming
      where not exists(select 1 from offline."sync_conflicts" existing where existing."id"=incoming."id")),"stynx_import_view_sync_batches" as (select * from offline."sync_batches" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batches",$5::jsonb) incoming
      where not exists(select 1 from offline."sync_batches" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id")),"stynx_import_view_sync_batch_transport_keys" as (select * from offline."sync_batch_transport_keys" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_batch_transport_keys",$6::jsonb) incoming
      where not exists(select 1 from offline."sync_batch_transport_keys" existing where existing."tenant_id"=incoming."tenant_id" and existing."transport_key"=incoming."transport_key")),"stynx_import_view_sync_item_receipts" as (select * from offline."sync_item_receipts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_receipts",$7::jsonb) incoming
      where not exists(select 1 from offline."sync_item_receipts" existing where existing."tenant_id"=incoming."tenant_id" and existing."idempotency_key"=incoming."idempotency_key")),"stynx_import_view_sync_item_attempts" as (select * from offline."sync_item_attempts" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_item_attempts",$8::jsonb) incoming
      where not exists(select 1 from offline."sync_item_attempts" existing where existing."tenant_id"=incoming."tenant_id" and existing."device_id"=incoming."device_id" and existing."device_batch_id"=incoming."device_batch_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_numbering_consumption" as (select * from offline."numbering_consumption" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_consumption",$9::jsonb) incoming
      where not exists(select 1 from offline."numbering_consumption" existing where existing."tenant_id"=incoming."tenant_id" and existing."reservation_id"=incoming."reservation_id" and existing."number"=incoming."number")),"stynx_import_view_sync_conflict_evidence" as (select * from offline."sync_conflict_evidence" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_evidence",$10::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_evidence" existing where existing."tenant_id"=incoming."tenant_id" and existing."conflict_id"=incoming."conflict_id" and existing."queue_item_id"=incoming."queue_item_id")),"stynx_import_view_sync_conflict_actions" as (select * from offline."sync_conflict_actions" union all
      select incoming.* from jsonb_populate_recordset(null::offline."sync_conflict_actions",$11::jsonb) incoming
      where not exists(select 1 from offline."sync_conflict_actions" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reconciliations" as (select * from offline."numbering_reconciliations" union all
      select incoming.* from jsonb_populate_recordset(null::offline."numbering_reconciliations",$12::jsonb) incoming
      where not exists(select 1 from offline."numbering_reconciliations" existing where existing."tenant_id"=incoming."tenant_id" and existing."id"=incoming."id")),"stynx_import_view_numbering_reservation_scopes" as (select * from offline."numbering_reservation_scopes" union all
    select incoming.tenant_id,incoming.device_id,incoming.shift_scope,gen_random_uuid() from (
      select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
      from "stynx_import_view_numbering_reservations") incoming where not exists(
        select 1 from offline."numbering_reservation_scopes" existing where existing.tenant_id=incoming.tenant_id
        and existing.device_id=incoming.device_id and existing.shift_scope=incoming.shift_scope)),"stynx_import_view_sync_import_receipts" as (select * from offline.sync_import_receipts union all
    select incoming.* from jsonb_populate_recordset(null::offline.sync_import_receipts,$13::jsonb) incoming)`;

const rateLimitIdentifiers = z.strictObject({
  table: text, tenantColumn: text, bucketColumn: text, windowStartColumn: text,
  hitsColumn: text, expiresAtColumn: text,
});
function quotedRateLimit(input: unknown) {
  const i = rateLimitIdentifiers.parse(input);
  return { table: quoteIdentifierPath(i.table), tenantColumn: quoteIdentifierPath(i.tenantColumn),
    bucketColumn: quoteIdentifierPath(i.bucketColumn), windowStartColumn: quoteIdentifierPath(i.windowStartColumn),
    hitsColumn: quoteIdentifierPath(i.hitsColumn), expiresAtColumn: quoteIdentifierPath(i.expiresAtColumn) };
}

const entitlementIdentifiers = z.strictObject({ table: text, tenantColumn: text, subjectColumn: text, emailColumn: text, activeColumn: text.nullable() });
const roleMetadataIdentifiers = z.strictObject({ viewName: text });
const auditPartitionIdentifiers = z.strictObject({ partition: text.min(1) });
const auditTableIdentifiers = z.strictObject({ schema: text, table: text });
const privacyIdentifier = text.regex(/^[A-Za-z_][A-Za-z0-9_]*$/u);
const privacyRetentionIdentifiers = z.strictObject({
  schema: privacyIdentifier, table: privacyIdentifier, timestampColumn: privacyIdentifier,
  tenantColumn: privacyIdentifier.nullable(),
});
const privacyExportIdentifiers = z.strictObject({
  schema: privacyIdentifier, table: privacyIdentifier,
  subjectColumn: privacyIdentifier.nullable(), tenantColumn: privacyIdentifier.nullable(),
});
const privacyErasureIdentifiers = z.strictObject({
  schema: privacyIdentifier, table: privacyIdentifier,
  subjectColumn: privacyIdentifier, tenantColumn: privacyIdentifier.nullable(),
});
const privacyUpdateIdentifiers = privacyErasureIdentifiers.extend({
  column: privacyIdentifier, onArchive: z.boolean(),
});
const privacyRetentionParams = z.union([z.tuple([text]), z.tuple([text, uuid])]);
const privacySubjectParams = z.union([z.tuple([uuid]), z.tuple([uuid, uuid])]);
function privacyRetentionWhere(i: z.output<typeof privacyRetentionIdentifiers>): string {
  return `${quoteTableIdentifier(i.timestampColumn)} < (clock_timestamp() - ($1::text || ' days')::interval)${i.tenantColumn === null ? '' : ` and ${quoteTableIdentifier(i.tenantColumn)} = $2::uuid`}`;
}
function privacySubjectWhere(i: z.output<typeof privacyErasureIdentifiers>): string {
  return `${quoteTableIdentifier(i.subjectColumn)} = $1::uuid${i.tenantColumn === null ? '' : ` and ${quoteTableIdentifier(i.tenantColumn)} = $2::uuid`}`;
}
function privacyRelation(i: {schema: string; table: string}): string {
  return `${quoteTableIdentifier(i.schema)}.${quoteTableIdentifier(i.table)}`;
}

const legacyOutboxIdentifier = text.regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u);
const legacyOutboxBindings = z.strictObject({ table: legacyOutboxIdentifier, ackTable: legacyOutboxIdentifier });
const legacyOutboxAckBindings = legacyOutboxBindings.extend({ tenant: z.boolean() });

const legacyOutboxNumber = z.custom<number>((value) => typeof value === 'number');
const legacyOutboxTimestamp = z.union([z.instanceof(Date), text, z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)]);
const legacyOutboxRow = z.object({ id: uuid, tenantId: uuid, entity: text, entityId: text,
 payload: z.record(text, z.json()), metadata: z.record(text, z.json()).nullable(),
 status: z.enum(['PENDING', 'SENT', 'ERROR', 'ACKED']), attempts: legacyOutboxNumber, lastError: text.nullable(),
 ackTime: legacyOutboxTimestamp.nullable(), nextAttemptAt: legacyOutboxTimestamp.nullable(), idempotencyKey: text,
 createdAt: legacyOutboxTimestamp, updatedAt: legacyOutboxTimestamp,
});

// BEGIN GENERATED audit-porm32 schemas
// ADR0034/0039: preserve mapper-owned InvalidDate and opaque nested values.
const auditPormTimestamp = z.union([text, z.instanceof(Date),
  z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)]);
const auditPormPayload = z.custom<Record<string, unknown> | unknown[] | string | number | boolean>(
  (value) => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ||
    (typeof value === 'object' && value !== null),
);
const auditPormTotal = z.union([text, z.bigint(), z.custom<number>((value) => typeof value === 'number')]);
const auditPormRow = z.object({
  occurred_at: auditPormTimestamp,
  op: text.nullish(), schema_name: text.nullish(), table_name: text.nullish(),
  request_id: text.nullish(), old_data: auditPormPayload.nullish(), new_data: auditPormPayload.nullish(),
  total: auditPormTotal.nullish(),
});
const auditPormLimit = z.number().min(0).max(500).refine(Number.isInteger);
// The original offset sanitizer permits integral values above MAX_SAFE_INTEGER.
const auditPormOffset = z.custom<number>((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && Math.trunc(value) === value);
const auditPormParams0 = z.tuple([auditPormLimit, auditPormOffset]);
const auditPormParams1 = z.tuple([text.optional(), auditPormLimit, auditPormOffset]);
const auditPormParams2 = z.tuple([text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
const auditPormParams3 = z.tuple([text.optional(), text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
const auditPormParams4 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
const auditPormParams5 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
// END GENERATED audit-porm32 schemas

// BEGIN GENERATED audit-remaining512 schemas
const auditLogReadRow = z.object({
  occurred_at: auditPormTimestamp,
  tenant_id: text.nullish(), actor_id: text.nullish(), operation: text.nullish(),
  table_schema: text.nullish(), table_name: text.nullish(), row_id: text.nullish(),
  request_id: text.nullish(), tags: auditPormPayload.nullish(), payload: auditPormPayload.nullish(),
  total: auditPormTotal.nullish(),
});
const auditEventsReadRow = z.object({
  occurred_at: auditPormTimestamp,
  tenancy_id: text.nullish(), actor_id: text.nullish(), actor_role: text.nullish(),
  operation: text.nullish(), entity: text.nullish(), entity_id: text.nullish(),
  pk: auditPormPayload.nullish(), request_id: text.nullish(), ip_address: text.nullish(),
  metadata: auditPormPayload.nullish(), old_data: auditPormPayload.nullish(), new_data: auditPormPayload.nullish(),
  previous_hash: text.nullish(), row_hash: text.nullish(), total: auditPormTotal.nullish(),
});
const auditReaderParams0 = z.tuple([auditPormLimit, auditPormOffset]);
const auditReaderParams1 = z.tuple([text.optional(), auditPormLimit, auditPormOffset]);
const auditReaderParams2 = z.tuple([text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
const auditReaderParams3 = z.tuple([text.optional(), text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
const auditReaderParams4 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
const auditReaderParams5 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
const auditReaderParams6 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
const auditReaderParams7 = z.tuple([text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), text.optional(), auditPormLimit, auditPormOffset]);
// END GENERATED audit-remaining512 schemas

// Closed ADR0029 definitions: callers supply identifier slots and bound values,
// never SQL text, fragments, registration functions or a row type assertion.
export const configuredOperations = {
  'outbox.legacy-enqueue': {
    identifiers: legacyOutboxBindings,
    params: z.tuple([text, text, text, text.nullable(), text]), row: legacyOutboxRow, expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxBindings.parse(input);
      const platform = i.table === 'outbox.messages' && i.ackTable === 'outbox.acknowledgements';
      const ownership = platform ? 'with ownership as materialized (select state from outbox.legacy_ownership where id=true for share nowait)' : '';
      return `${ownership}
         insert into ${quoteIdentifierPath(i.table)} (id, tenant_id, entity, entity_id, payload, metadata, status, idempotency_key, next_attempt_at)
         select
           gen_random_uuid(),
           nullif(current_setting('app.tenant_id', true), '')::uuid,
           $1, $2, $3::jsonb, $4::jsonb, 'PENDING', $5, null
         ${platform ? "from ownership where state='LEGACY'" : ''}
         on conflict (tenant_id, entity, entity_id)
         do update set updated_at = now(), idempotency_key = excluded.idempotency_key
         returning 
    id,
    tenant_id as "tenantId",
    entity,
    entity_id as "entityId",
    payload,
    metadata,
    status,
    attempts,
    last_error as "lastError",
    ack_time as "ackTime",
    next_attempt_at as "nextAttemptAt",
    idempotency_key as "idempotencyKey",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
    },
  },
  'outbox.legacy-get-one': {
    identifiers: legacyOutboxBindings,
    params: z.tuple([text, text]), row: legacyOutboxRow, expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxBindings.parse(input);
      return `select 
    id,
    tenant_id as "tenantId",
    entity,
    entity_id as "entityId",
    payload,
    metadata,
    status,
    attempts,
    last_error as "lastError",
    ack_time as "ackTime",
    next_attempt_at as "nextAttemptAt",
    idempotency_key as "idempotencyKey",
    created_at as "createdAt",
    updated_at as "updatedAt"
   from ${quoteIdentifierPath(i.table)} where entity = $1 and entity_id = $2`;
    },
  },
  'outbox.legacy-claim-due': {
    identifiers: legacyOutboxBindings,
    params: z.tuple([legacyOutboxNumber]), row: legacyOutboxRow, expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxBindings.parse(input);
      const platform = i.table === 'outbox.messages' && i.ackTable === 'outbox.acknowledgements';
      const ownership = platform ? 'with ownership as materialized (select state from outbox.legacy_ownership where id=true for share nowait)' : '';
      return `${platform ? ownership + ',' : 'with'} due as (
               select id
                 from ${quoteIdentifierPath(i.table)} ${platform ? 'cross join ownership' : ''}
                where status in ('PENDING', 'ERROR')
                  ${platform ? "and ownership.state='LEGACY'" : ''}
                  ${platform ? 'and migrated_event_id is null' : ''}
                  and coalesce(next_attempt_at, created_at) <= now()
                order by created_at asc
                limit $1
                for update skip locked
             )
             update ${quoteIdentifierPath(i.table)} o
                set status = 'SENT',
                    attempts = attempts + 1,
                    last_error = null,
                    next_attempt_at = null,
                    updated_at = now()
               from due
              where o.id = due.id
              returning 
    o.id,
    o.tenant_id as "tenantId",
    o.entity,
    o.entity_id as "entityId",
    o.payload,
    o.metadata,
    o.status,
    o.attempts,
    o.last_error as "lastError",
    o.ack_time as "ackTime",
    o.next_attempt_at as "nextAttemptAt",
    o.idempotency_key as "idempotencyKey",
    o.created_at as "createdAt",
    o.updated_at as "updatedAt"
  `;
    },
  },
  'outbox.legacy-fail': {
    identifiers: legacyOutboxBindings,
    params: z.tuple([uuid, text, z.instanceof(Date)]), row: legacyOutboxRow, expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxBindings.parse(input);
      const platform = i.table === 'outbox.messages' && i.ackTable === 'outbox.acknowledgements';
      const ownership = platform ? 'with ownership as materialized (select state from outbox.legacy_ownership where id=true for share nowait)' : '';
      return `${ownership} update ${quoteIdentifierPath(i.table)}
                set status = 'ERROR',
                    last_error = $2,
                    next_attempt_at = $3,
                    updated_at = now()
              ${platform ? 'from ownership' : ''}
              where id = $1 and status <> 'ACKED'
              returning 
    id,
    tenant_id as "tenantId",
    entity,
    entity_id as "entityId",
    payload,
    metadata,
    status,
    attempts,
    last_error as "lastError",
    ack_time as "ackTime",
    next_attempt_at as "nextAttemptAt",
    idempotency_key as "idempotencyKey",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
    },
  },
  'outbox.legacy-acked-row': {
    identifiers: legacyOutboxBindings,
    params: z.tuple([uuid]), row: legacyOutboxRow, expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxBindings.parse(input);
      return `select 
    id,
    tenant_id as "tenantId",
    entity,
    entity_id as "entityId",
    payload,
    metadata,
    status,
    attempts,
    last_error as "lastError",
    ack_time as "ackTime",
    next_attempt_at as "nextAttemptAt",
    idempotency_key as "idempotencyKey",
    created_at as "createdAt",
    updated_at as "updatedAt"
  
                 from ${quoteIdentifierPath(i.table)} where id=$1::uuid and status='ACKED'`;
    },
  },
  'outbox.legacy-retry': {
    identifiers: legacyOutboxBindings,
    params: z.tuple([uuid, legacyOutboxNumber, z.instanceof(Date)]), row: legacyOutboxRow, expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxBindings.parse(input);
      return `update ${quoteIdentifierPath(i.table)}
                set attempts = $2,
                    status = 'PENDING',
                    last_error = null,
                    next_attempt_at = $3,
                    updated_at = now()
              where id = $1
              returning 
    id,
    tenant_id as "tenantId",
    entity,
    entity_id as "entityId",
    payload,
    metadata,
    status,
    attempts,
    last_error as "lastError",
    ack_time as "ackTime",
    next_attempt_at as "nextAttemptAt",
    idempotency_key as "idempotencyKey",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
    },
  },
  'outbox.legacy-ack': {
    identifiers: legacyOutboxBindings,
    params: z.tuple([uuid, text, text.nullable(), z.instanceof(Date).nullable()]), row: legacyOutboxRow, expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxBindings.parse(input);
      return `update ${quoteIdentifierPath(i.table)}
                set status = $2::outbox.message_status,
                    ack_time = now(),
                    last_error = case when $2::text = 'ERROR' then $3 else null end,
                    next_attempt_at = $4,
                    updated_at = now()
              where id = $1
              returning 
    id,
    tenant_id as "tenantId",
    entity,
    entity_id as "entityId",
    payload,
    metadata,
    status,
    attempts,
    last_error as "lastError",
    ack_time as "ackTime",
    next_attempt_at as "nextAttemptAt",
    idempotency_key as "idempotencyKey",
    created_at as "createdAt",
    updated_at as "updatedAt"
  `;
    },
  },
  'outbox.legacy-ack-target': {
    identifiers: legacyOutboxAckBindings,
    params: z.union([z.tuple([text, text]), z.tuple([text, text, uuid])]),
    parameterCount: (input: unknown): number => legacyOutboxAckBindings.parse(input).tenant ? 3 : 2,
    row: z.object({ id: uuid, tenantId: uuid, migratedEventId: uuid.nullable(), attempts: z.number() }),
    expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxAckBindings.parse(input);
      const platform = i.table === 'outbox.messages' && i.ackTable === 'outbox.acknowledgements';
      const ownership = platform
        ? 'with ownership as materialized (select state from outbox.legacy_ownership where id=true for share nowait)'
        : '';
      // Keep the original second path-component lock target, including its
      // database rejection for unsupported unqualified/multipart bindings.
      const lockTarget = quoteIdentifierPath(i.table.split('.')[1] ?? 'undefined');
      return `${ownership} select id, tenant_id as "tenantId", attempts, ${platform ? 'migrated_event_id' : 'null::uuid'} as "migratedEventId"
         from ${quoteIdentifierPath(i.table)} ${platform ? 'cross join ownership' : ''}
         where entity = $1 and entity_id = $2 ${i.tenant ? 'and tenant_id = $3::uuid' : ''} for update of ${lockTarget}`;
    },
  },
  'outbox.legacy-retry-state': {
    identifiers: legacyOutboxBindings,
    params: z.tuple([uuid]),
    row: z.object({ attempts: z.number(), migrated_event_id: uuid.nullable().optional() }),
    expects: 'many',
    render: (input: unknown): string => {
      const i = legacyOutboxBindings.parse(input);
      const platform = i.table === 'outbox.messages' && i.ackTable === 'outbox.acknowledgements';
      const ownership = platform
        ? 'with ownership as materialized (select state from outbox.legacy_ownership where id=true for share nowait)'
        : '';
      return `${ownership} select attempts${platform ? ',migrated_event_id' : ''} from ${quoteIdentifierPath(i.table)} ${platform ? 'cross join ownership' : ''} where id = $1`;
    },
  },
  'outbox.legacy-record-ack': {
    identifiers: z.strictObject({ table: text.regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u) }),
    params: z.tuple([uuid, uuid, text, text.nullable()]),
    row: z.object({}),
    expects: 'none',
    render: (input: unknown): string => {
      const i = z.strictObject({ table: text }).parse(input);
      return `insert into ${quoteIdentifierPath(i.table)} (id, tenant_id, message_id, ack_status, ack_message, ack_time)
               values (gen_random_uuid(), $1, $2, $3, $4, now())
               on conflict (message_id) do nothing`;
    },
  },
// BEGIN GENERATED audit-porm32 operations
  'audit.read-porm.mask.0': {
    identifiers: auditTableIdentifiers, params: auditPormParams0,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      
      ORDER BY occurred_at DESC
      LIMIT $1
      OFFSET $2`;
    },
  },
  'audit.read-porm.mask.1': {
    identifiers: auditTableIdentifiers, params: auditPormParams1,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-porm.mask.2': {
    identifiers: auditTableIdentifiers, params: auditPormParams1,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE op = $1
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-porm.mask.3': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND op = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.4': {
    identifiers: auditTableIdentifiers, params: auditPormParams1,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-porm.mask.5': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND request_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.6': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE op = $1 AND request_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.7': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND op = $2 AND request_id = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.8': {
    identifiers: auditTableIdentifiers, params: auditPormParams1,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at >= $1::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-porm.mask.9': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.10': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE op = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.11': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND op = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.12': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.13': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.14': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE op = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.15': {
    identifiers: auditTableIdentifiers, params: auditPormParams4,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND op = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-porm.mask.16': {
    identifiers: auditTableIdentifiers, params: auditPormParams1,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at <= $1::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-porm.mask.17': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.18': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE op = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.19': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND op = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.20': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.21': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.22': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE op = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.23': {
    identifiers: auditTableIdentifiers, params: auditPormParams4,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND op = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-porm.mask.24': {
    identifiers: auditTableIdentifiers, params: auditPormParams2,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at >= $1::timestamptz AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-porm.mask.25': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.26': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE op = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.27': {
    identifiers: auditTableIdentifiers, params: auditPormParams4,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND op = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-porm.mask.28': {
    identifiers: auditTableIdentifiers, params: auditPormParams3,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-porm.mask.29': {
    identifiers: auditTableIdentifiers, params: auditPormParams4,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-porm.mask.30': {
    identifiers: auditTableIdentifiers, params: auditPormParams4,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE op = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-porm.mask.31': {
    identifiers: auditTableIdentifiers, params: auditPormParams5,
    row: auditPormRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (schema_name || '.' || table_name) = $1 AND op = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
// END GENERATED audit-porm32 operations

// BEGIN GENERATED audit-remaining512 log-operations
  'audit.read-log.mask.0': {
    identifiers: auditTableIdentifiers, params: auditReaderParams0,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      
      ORDER BY occurred_at DESC, id DESC
      LIMIT $1
      OFFSET $2`;
    },
  },
  'audit.read-log.mask.1': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-log.mask.2': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-log.mask.3': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.4': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-log.mask.5': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.6': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.7': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.8': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-log.mask.9': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND actor_id::text = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.10': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND actor_id::text = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.11': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND actor_id::text = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.12': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.13': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND actor_id::text = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.14': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND actor_id::text = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.15': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND actor_id::text = $4
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.16': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-log.mask.17': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND request_id = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.18': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND request_id = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.19': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND request_id = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.20': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND request_id = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.21': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND request_id = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.22': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND request_id = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.23': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND request_id = $4
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.24': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND request_id = $2
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.25': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND actor_id::text = $2 AND request_id = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.26': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND actor_id::text = $2 AND request_id = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.27': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND actor_id::text = $3 AND request_id = $4
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.28': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND request_id = $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.29': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.30': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.31': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND actor_id::text = $4 AND request_id = $5
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.32': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at >= $1::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-log.mask.33': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.34': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.35': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.36': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.37': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.38': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.39': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.40': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.41': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.42': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.43': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.44': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.45': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.46': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.47': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND actor_id::text = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.48': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.49': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.50': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.51': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.52': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.53': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.54': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.55': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.56': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.57': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.58': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.59': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.60': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.61': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.62': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.63': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND actor_id::text = $4 AND request_id = $5 AND occurred_at >= $6::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-log.mask.64': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at <= $1::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-log.mask.65': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.66': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.67': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.68': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.69': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.70': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.71': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.72': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.73': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND actor_id::text = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.74': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND actor_id::text = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.75': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND actor_id::text = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.76': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.77': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.78': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.79': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND actor_id::text = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.80': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.81': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.82': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.83': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.84': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.85': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.86': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.87': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND request_id = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.88': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.89': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.90': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.91': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.92': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.93': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.94': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.95': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND actor_id::text = $4 AND request_id = $5 AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-log.mask.96': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at >= $1::timestamptz AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-log.mask.97': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.98': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.99': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.100': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.101': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.102': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.103': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.104': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.105': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.106': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.107': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.108': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.109': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.110': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.111': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND actor_id::text = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-log.mask.112': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-log.mask.113': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.114': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.115': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.116': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.117': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.118': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.119': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-log.mask.120': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-log.mask.121': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.122': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.123': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-log.mask.124': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-log.mask.125': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-log.mask.126': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE (table_schema || '.' || table_name) = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-log.mask.127': {
    identifiers: auditTableIdentifiers, params: auditReaderParams7,
    row: auditLogReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenant_id::text = $1 AND (table_schema || '.' || table_name) = $2 AND operation = $3 AND actor_id::text = $4 AND request_id = $5 AND occurred_at >= $6::timestamptz AND occurred_at <= $7::timestamptz
      ORDER BY occurred_at DESC, id DESC
      LIMIT $8
      OFFSET $9`;
    },
  },
// END GENERATED audit-remaining512 log-operations

// BEGIN GENERATED audit-remaining512 events-operations
  'audit.read-events.mask.0': {
    identifiers: auditTableIdentifiers, params: auditReaderParams0,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      
      ORDER BY occurred_at DESC
      LIMIT $1
      OFFSET $2`;
    },
  },
  'audit.read-events.mask.1': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-events.mask.2': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-events.mask.3': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.4': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-events.mask.5': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.6': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.7': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.8': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-events.mask.9': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND actor_id::text = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.10': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND actor_id::text = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.11': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND actor_id::text = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.12': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.13': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND actor_id::text = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.14': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND actor_id::text = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.15': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND actor_id::text = $4
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.16': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-events.mask.17': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND request_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.18': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND request_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.19': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND request_id = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.20': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND request_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.21': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND request_id = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.22': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND request_id = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.23': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND request_id = $4
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.24': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND request_id = $2
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.25': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND actor_id::text = $2 AND request_id = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.26': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND actor_id::text = $2 AND request_id = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.27': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND actor_id::text = $3 AND request_id = $4
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.28': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND request_id = $3
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.29': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.30': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.31': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND actor_id::text = $4 AND request_id = $5
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.32': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at >= $1::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-events.mask.33': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.34': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.35': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.36': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.37': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.38': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.39': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.40': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.41': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.42': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.43': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.44': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.45': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.46': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.47': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND actor_id::text = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.48': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at >= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.49': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.50': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.51': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.52': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.53': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.54': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.55': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.56': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.57': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.58': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.59': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.60': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.61': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.62': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.63': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND actor_id::text = $4 AND request_id = $5 AND occurred_at >= $6::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-events.mask.64': {
    identifiers: auditTableIdentifiers, params: auditReaderParams1,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at <= $1::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $2
      OFFSET $3`;
    },
  },
  'audit.read-events.mask.65': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.66': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.67': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.68': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.69': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.70': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.71': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.72': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.73': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND actor_id::text = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.74': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND actor_id::text = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.75': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND actor_id::text = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.76': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.77': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.78': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.79': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND actor_id::text = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.80': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.81': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.82': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.83': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.84': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.85': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.86': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.87': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND request_id = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.88': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND request_id = $2 AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.89': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.90': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.91': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.92': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.93': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.94': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.95': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND actor_id::text = $4 AND request_id = $5 AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-events.mask.96': {
    identifiers: auditTableIdentifiers, params: auditReaderParams2,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE occurred_at >= $1::timestamptz AND occurred_at <= $2::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $3
      OFFSET $4`;
    },
  },
  'audit.read-events.mask.97': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.98': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.99': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.100': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.101': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.102': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.103': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.104': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.105': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.106': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.107': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.108': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.109': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.110': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND actor_id::text = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.111': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND actor_id::text = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-events.mask.112': {
    identifiers: auditTableIdentifiers, params: auditReaderParams3,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE request_id = $1 AND occurred_at >= $2::timestamptz AND occurred_at <= $3::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $4
      OFFSET $5`;
    },
  },
  'audit.read-events.mask.113': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.114': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.115': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.116': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.117': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.118': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.119': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-events.mask.120': {
    identifiers: auditTableIdentifiers, params: auditReaderParams4,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE actor_id::text = $1 AND request_id = $2 AND occurred_at >= $3::timestamptz AND occurred_at <= $4::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $5
      OFFSET $6`;
    },
  },
  'audit.read-events.mask.121': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.122': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.123': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-events.mask.124': {
    identifiers: auditTableIdentifiers, params: auditReaderParams5,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE operation = $1 AND actor_id::text = $2 AND request_id = $3 AND occurred_at >= $4::timestamptz AND occurred_at <= $5::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $6
      OFFSET $7`;
    },
  },
  'audit.read-events.mask.125': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-events.mask.126': {
    identifiers: auditTableIdentifiers, params: auditReaderParams6,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE entity = $1 AND operation = $2 AND actor_id::text = $3 AND request_id = $4 AND occurred_at >= $5::timestamptz AND occurred_at <= $6::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $7
      OFFSET $8`;
    },
  },
  'audit.read-events.mask.127': {
    identifiers: auditTableIdentifiers, params: auditReaderParams7,
    row: auditEventsReadRow, expects: 'many', legacyAuditReadResult: true,
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)}
      WHERE tenancy_id::text = $1 AND entity = $2 AND operation = $3 AND actor_id::text = $4 AND request_id = $5 AND occurred_at >= $6::timestamptz AND occurred_at <= $7::timestamptz
      ORDER BY occurred_at DESC
      LIMIT $8
      OFFSET $9`;
    },
  },
// END GENERATED audit-remaining512 events-operations

  'audit.write-table': {
    identifiers: auditTableIdentifiers,
    params: z.tuple([text, text.nullable(), text, text, text.nullable(), text.nullable(), text.nullable(), text]),
    row: z.object({}), expects: 'none',
    render: (input: unknown): string => {
      const i = auditTableIdentifiers.parse(input);
      return `INSERT INTO ${quoteIdentifierPath(i.schema)}.${quoteIdentifierPath(i.table)} (
         occurred_at,
         actor_sub,
         action,
         resource_type,
         resource_id,
         request_id,
         ip_address,
         metadata
       ) VALUES (
         $1::timestamptz,
         $2::text,
         $3::text,
         $4::text,
         $5::text,
         $6::text,
         NULLIF($7::text, ''),
         $8::jsonb
       )`;
    },
  },
  'privacy.retention-count': {
    identifiers: privacyRetentionIdentifiers, params: privacyRetentionParams,
    parameterCount: (input: unknown): number => privacyRetentionIdentifiers.parse(input).tenantColumn === null ? 1 : 2,
    row: z.object({ total: integer.nonnegative() }), expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = privacyRetentionIdentifiers.parse(input);
      return `select count(*)::int as total from ${privacyRelation(i)} where ${privacyRetentionWhere(i)}`;
    },
  },
  'privacy.retention-delete': {
    identifiers: privacyRetentionIdentifiers, params: privacyRetentionParams,
    parameterCount: (input: unknown): number => privacyRetentionIdentifiers.parse(input).tenantColumn === null ? 1 : 2,
    row: z.object({}), expects: 'none',
    render: (input: unknown): string => {
      const i = privacyRetentionIdentifiers.parse(input);
      return `delete from ${privacyRelation(i)} where ${privacyRetentionWhere(i)}`;
    },
  },
  'privacy.export': {
    identifiers: privacyExportIdentifiers,
    params: z.union([z.tuple([]), z.tuple([uuid]), z.tuple([uuid, uuid])]),
    parameterCount: (input: unknown): number => {
      const i = privacyExportIdentifiers.parse(input);
      return Number(i.subjectColumn !== null) + Number(i.tenantColumn !== null);
    },
    row: z.object({ row_json: z.record(text, z.json()) }), expects: 'many',
    render: (input: unknown): string => {
      const i = privacyExportIdentifiers.parse(input);
      const filters: string[] = [];
      if (i.subjectColumn !== null) filters.push(`${quoteTableIdentifier(i.subjectColumn)} = $1::uuid`);
      if (i.tenantColumn !== null) filters.push(`${quoteTableIdentifier(i.tenantColumn)} = $${filters.length + 1}::uuid`);
      const where = filters.length > 0 ? `where ${filters.join(' and ')}` : '';
      return `
        select row_to_json(payload) as row_json
        from (
          select *
          from ${privacyRelation(i)}
          ${where}
        ) payload
      `;
    },
  },
  'privacy.erasure-delete': {
    identifiers: privacyErasureIdentifiers, params: privacySubjectParams,
    parameterCount: (input: unknown): number => privacyErasureIdentifiers.parse(input).tenantColumn === null ? 1 : 2,
    row: z.object({}), expects: 'none',
    render: (input: unknown): string => {
      const i = privacyErasureIdentifiers.parse(input);
      return `delete from ${privacyRelation(i)} where ${privacySubjectWhere(i)}`;
    },
  },
  'privacy.erasure-null': {
    identifiers: privacyUpdateIdentifiers, params: privacySubjectParams,
    parameterCount: (input: unknown): number => privacyUpdateIdentifiers.parse(input).tenantColumn === null ? 1 : 2,
    row: z.object({}), expects: 'none',
    render: (input: unknown): string => {
      const i = privacyUpdateIdentifiers.parse(input);
      const archive = i.onArchive ? ', "last_erasure_at" = clock_timestamp()' : '';
      return `update ${privacyRelation(i)} set ${quoteTableIdentifier(i.column)} = null${archive} where ${privacySubjectWhere(i)}`;
    },
  },
  'privacy.erasure-replace': {
    identifiers: privacyUpdateIdentifiers,
    params: z.union([z.tuple([uuid, text]), z.tuple([uuid, uuid, text])]),
    parameterCount: (input: unknown): number => privacyUpdateIdentifiers.parse(input).tenantColumn === null ? 2 : 3,
    row: z.object({}), expects: 'none',
    render: (input: unknown): string => {
      const i = privacyUpdateIdentifiers.parse(input);
      const archive = i.onArchive ? ', "last_erasure_at" = clock_timestamp()' : '';
      return `update ${privacyRelation(i)} set ${quoteTableIdentifier(i.column)} = $${i.tenantColumn === null ? 2 : 3}${archive} where ${privacySubjectWhere(i)}`;
    },
  },
  'audit.partition-retention': {
    identifiers: auditPartitionIdentifiers, params: z.tuple([]),
    row: z.object({ keep_longer: z.boolean() }), expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = auditPartitionIdentifiers.parse(input);
      return `
              select coalesce(
                bool_or(
                  tags @> '{"lgpd_erasure": true}'::jsonb
                  or tags @> '{"hard_delete": true, "from_archive": true}'::jsonb
                ),
                false
              ) as keep_longer
              from audit.${quoteTableIdentifier(i.partition)}
            `;
    },
  },
  'audit.partition-detach': {
    identifiers: auditPartitionIdentifiers, params: z.tuple([]),
    row: z.object({}), expects: 'none',
    render: (input: unknown): string => {
      const i = auditPartitionIdentifiers.parse(input);
      return `alter table audit.log detach partition audit.${quoteTableIdentifier(i.partition)}`;
    },
  },
  'audit.partition-drop': {
    identifiers: auditPartitionIdentifiers, params: z.tuple([]),
    row: z.object({}), expects: 'none',
    render: (input: unknown): string => {
      const i = auditPartitionIdentifiers.parse(input);
      return `drop table audit.${quoteTableIdentifier(i.partition)}`;
    },
  },
  'auth.tenant-entitlement': {
    identifiers: entitlementIdentifiers, params: z.tuple([text, text.nullable(), text.nullable()]),
    row: z.object({ one: z.literal(1) }), expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = entitlementIdentifiers.parse(input);
      const active = i.activeColumn === null ? '' : ` and ${quoteIdentifierPath(i.activeColumn)} = true`;
      return `select 1 as one
      from ${quoteIdentifierPath(i.table)}
      where ${quoteIdentifierPath(i.tenantColumn)} = $1
      ${active}
      and (
        (${quoteIdentifierPath(i.subjectColumn)} is not distinct from $2)
        or (${quoteIdentifierPath(i.emailColumn)} is not distinct from $3)
      )
      limit 1`;
    },
  },
  'identity.role-metadata': {
    identifiers: roleMetadataIdentifiers, params: z.tuple([text]),
    row: z.object({ code: text, label: text.nullable().optional(), icon: text.nullable().optional(), meta: z.record(text, z.json()).nullable().optional(), sort_order: z.number().nullable().optional(), order: z.number().nullable().optional() }),
    expects: 'many',
    render: (input: unknown): string => {
      const i = roleMetadataIdentifiers.parse(input);
      return `SELECT code, label, icon, meta, sort_order, "order"
         FROM ${quoteIdentifierPath(i.viewName)}
        WHERE domain = $1
        ORDER BY "order", code`;
    },
  },
  'ratelimit.consume': {
    identifiers: rateLimitIdentifiers, params: z.tuple([uuid, text, text, integer, text]), row: z.object({ hitCount: integer }), expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = quotedRateLimit(input);
      return `INSERT INTO ${i.table} (
         ${i.tenantColumn},
         ${i.bucketColumn},
         ${i.windowStartColumn},
         ${i.hitsColumn},
         ${i.expiresAtColumn}
       )
       VALUES (
         $1::uuid,
         $2,
         $3::timestamptz,
         $4::int,
         $5::timestamptz
       )
       ON CONFLICT (${i.tenantColumn}, ${i.bucketColumn}, ${i.windowStartColumn})
       DO UPDATE
         SET ${i.hitsColumn} = ${i.table}.${i.hitsColumn} + EXCLUDED.${i.hitsColumn},
             ${i.expiresAtColumn} = EXCLUDED.${i.expiresAtColumn}
       RETURNING ${i.hitsColumn} AS "hitCount"`;
    },
  },
  'ratelimit.increment': {
    identifiers: rateLimitIdentifiers, params: z.tuple([uuid, text, text, text]), row: z.object({ hitCount: integer }), expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = quotedRateLimit(input);
      return `INSERT INTO ${i.table} (
         ${i.tenantColumn},
         ${i.bucketColumn},
         ${i.windowStartColumn},
         ${i.hitsColumn},
         ${i.expiresAtColumn}
       )
       VALUES (
         $1::uuid,
         $2,
         $3::timestamptz,
         1,
         $4::timestamptz
       )
       ON CONFLICT (${i.tenantColumn}, ${i.bucketColumn}, ${i.windowStartColumn})
       DO UPDATE
         SET ${i.hitsColumn} = ${i.table}.${i.hitsColumn} + 1,
             ${i.expiresAtColumn} = EXCLUDED.${i.expiresAtColumn}
       RETURNING ${i.hitsColumn} AS "hitCount"`;
    },
  },
  'ratelimit.cleanup': {
    identifiers: rateLimitIdentifiers, params: z.tuple([text]), row: z.object({}), expects: 'none',
    render: (input: unknown): string => {
      const i = quotedRateLimit(input);
      return `DELETE FROM ${i.table}
        WHERE ${i.tenantColumn}::text = $1
          AND ${i.expiresAtColumn} < now()`;
    },
  },

  'offline.import-foreign-key-orphans': {
    identifiers: importForeignKeyIdentifiers,
    params: importOverlayParams, row: z.object({ count: text.regex(/^\d+$/u) }), expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = importForeignKeyIdentifiers.parse(input);
      const source = importOverlayRelation(i.sourceSchema, i.sourceTable);
      const target = importOverlayRelation(i.targetSchema, i.targetTable);
      const present = i.sourceColumns.map((column) => `child.${quoteTableIdentifier(column)} is not null`).join(' and ');
      const equality = i.sourceColumns.map((column, index) => {
        const referenced = i.targetColumns[index];
        if (referenced === undefined) throw new TypeError('Invalid foreign-key catalog binding');
        return `child.${quoteTableIdentifier(column)}=parent.${quoteTableIdentifier(referenced)}`;
      }).join(' and ');
      return `${importOverlayPrefix} select count(*)::text as count from ${source} child
      where ${present} and not exists(select 1 from ${target} parent where ${equality})`;
    },
  },
  'offline.import-tenant-present': {
    identifiers: tenantIdentifiers,
    params: z.tuple([uuid]), row: z.object({ present: z.boolean() }), expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = tenantIdentifiers.parse(input);
      return `select exists(select 1 from ${quoteTableIdentifier(i.schema)}.${quoteTableIdentifier(i.table)} where ${quoteTableIdentifier(i.column)}=$1::uuid) as present`;
    },
  },
  'catalog.foreign-key-orphans': {
    identifiers: foreignKeyIdentifiers,
    params: z.tuple([]), row: z.object({ count: text.regex(/^\d+$/u) }), expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = foreignKeyIdentifiers.parse(input);
      const source = `${quoteTableIdentifier(i.sourceSchema)}.${quoteTableIdentifier(i.sourceTable)}`;
      const target = `${quoteTableIdentifier(i.targetSchema)}.${quoteTableIdentifier(i.targetTable)}`;
      const present = i.sourceColumns.map((column) => `child.${quoteTableIdentifier(column)} is not null`).join(' and ');
      const equality = i.sourceColumns.map((column, index) => {
        const referenced = i.targetColumns[index];
        if (referenced === undefined) throw new TypeError('Invalid foreign-key catalog binding');
        return `child.${quoteTableIdentifier(column)}=parent.${quoteTableIdentifier(referenced)}`;
      }).join(' and ');
      return `select count(*)::text as count from ${source} child
         where ${present} and not exists(select 1 from ${target} parent where ${equality})`;
    },
  },
  'testing.archive-count': {
    identifiers: tableIdentifiers,
    params: z.tuple([uuid]),
    row: z.object({ value: integer.nonnegative() }),
    expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = tableIdentifiers.parse(input);
      return `select count(*)::int as value from "archive".${quoteTableIdentifier(`${i.schema}_${i.table}`)} where id = $1::uuid`;
    },
  },
  'testing.live-count': {
    identifiers: tableIdentifiers,
    params: z.tuple([uuid]),
    row: z.object({ value: integer.nonnegative() }),
    expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = tableIdentifiers.parse(input);
      return `select count(*)::int as value from ${quoteTableIdentifier(i.schema)}.${quoteTableIdentifier(i.table)} where id = $1::uuid`;
    },
  },
  'idempotency.lookup': {
    identifiers,
    params: z.tuple([text, text]),
    row: z.object({ requestFingerprint: text, statusCode: integer.nullable().optional(), responseBody: z.json(), expiresAt: z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]) }),
    expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = quoted(identifiers.parse(input));
      return `SELECT ${i.fingerprintColumn} AS "requestFingerprint",
              ${i.statusCodeColumn} AS "statusCode",
              ${i.bodyColumn} AS "responseBody",
              ${i.expiresAtColumn} AS "expiresAt"
         FROM ${i.table}
        WHERE ${i.tenantColumn}::text = $1
          AND ${i.keyColumn} = $2
          AND ${i.expiresAtColumn} > now()
        LIMIT 1`;
    },
  },
  'idempotency.reserve': {
    identifiers,
    params: z.tuple([uuid, text, text, ttlSeconds]),
    row: z.object({ reserved: z.literal(1) }),
    expects: 'zero-or-one',
    render: (input: unknown): string => {
      const i = quoted(identifiers.parse(input));
      return `INSERT INTO ${i.table} (
         id, ${i.tenantColumn}, ${i.keyColumn}, ${i.fingerprintColumn},
         ${i.statusCodeColumn}, ${i.bodyColumn}, ${i.expiresAtColumn}
       ) VALUES (gen_random_uuid(), $1::uuid, $2, $3, NULL, NULL, now() + make_interval(secs => $4::int))
       ON CONFLICT (${i.tenantColumn}, ${i.keyColumn}) DO NOTHING
       RETURNING 1 AS reserved`;
    },
  },
  'idempotency.complete': {
    identifiers,
    params: z.tuple([text, text, text, integer, text, ttlSeconds]),
    row: z.object({}),
    expects: 'none',
    render: (input: unknown): string => {
      const i = quoted(identifiers.parse(input));
      return `UPDATE ${i.table}
          SET ${i.statusCodeColumn} = $4,
              ${i.bodyColumn} = $5::jsonb,
              ${i.expiresAtColumn} = now() + make_interval(secs => $6::int)
        WHERE ${i.tenantColumn}::text = $1
          AND ${i.keyColumn} = $2
          AND ${i.fingerprintColumn} = $3`;
    },
  },
  'idempotency.clear': {
    identifiers,
    params: z.tuple([text, text, text]),
    row: z.object({}),
    expects: 'none',
    render: (input: unknown): string => {
      const i = quoted(identifiers.parse(input));
      return `DELETE FROM ${i.table}
        WHERE ${i.tenantColumn}::text = $1
          AND ${i.keyColumn} = $2
          AND ${i.fingerprintColumn} = $3
          AND ${i.bodyColumn} IS NULL`;
    },
  },
} as const;

for (const operation of Object.values(configuredOperations)) Object.freeze(operation);
Object.freeze(configuredOperations);

export type ConfiguredOperation = keyof typeof configuredOperations;
export type ConfiguredIdentifiers<O extends ConfiguredOperation> = z.input<(typeof configuredOperations)[O]['identifiers']>;
export type ConfiguredParams<O extends ConfiguredOperation> = z.input<(typeof configuredOperations)[O]['params']>;
export type ConfiguredRow<O extends ConfiguredOperation> = z.output<(typeof configuredOperations)[O]['row']>;
