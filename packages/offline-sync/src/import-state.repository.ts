import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const bigint = text.regex(/^-?\d+$/u);
const timestamp = text;
const matches = z.object({ matches: z.boolean() });

// Twelve reviewed import shapes are expanded as literal SQL. Runtime callers
// select a closed shape; they cannot supply SQL columns, casts, or expressions.

const importRangesExisting = defineQuery({
  name: 'offline.importRangesExisting',
  text: sql`select ("id" is not distinct from $1::uuid and "tenant_id" is not distinct from $2::uuid and "org_unit_id" is not distinct from $3::text and "entity_type" is not distinct from $4::text and "series" is not distinct from $5::text and "start_number" is not distinct from $6::bigint and "end_number" is not distinct from $7::bigint and "next_number" is not distinct from $8::bigint and "status" is not distinct from $9::text and "created_at" is not distinct from $10::timestamptz and "updated_at" is not distinct from $11::timestamptz and "consumer_attributes"::jsonb is not distinct from $12::json::jsonb and "created_by" is not distinct from $13::text and "creation_key" is not distinct from $14::text and "creation_fingerprint" is not distinct from $15::text and "creation_receipt" is not distinct from $16::jsonb and "cancelled_by" is not distinct from $17::text and "cancellation_reason" is not distinct from $18::text and "cancelled_at" is not distinct from $19::timestamptz) as matches from offline."numbering_ranges" where "id"=$1::uuid`,
  params: z.tuple([uuid, uuid, text, text, text, bigint, bigint, bigint, text, timestamp, timestamp.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), timestamp.nullable()]), row: matches, expects: 'many',
});

const importRangesInsert = defineQuery({
  name: 'offline.importRangesInsert',
  text: sql`insert into offline."numbering_ranges" ("id","tenant_id","org_unit_id","entity_type","series","start_number","end_number","next_number","status","created_at","updated_at","consumer_attributes","created_by","creation_key","creation_fingerprint","creation_receipt","cancelled_by","cancellation_reason","cancelled_at") values ($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::bigint,$7::bigint,$8::bigint,$9::text,$10::timestamptz,$11::timestamptz,$12::json,$13::text,$14::text,$15::text,$16::jsonb,$17::text,$18::text,$19::timestamptz)`,
  params: z.tuple([uuid, uuid, text, text, text, bigint, bigint, bigint, text, timestamp, timestamp.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), timestamp.nullable()]), row: z.object({}), expects: 'none',
});

const importReservationsExisting = defineQuery({
  name: 'offline.importReservationsExisting',
  text: sql`select ("id" is not distinct from $1::uuid and "tenant_id" is not distinct from $2::uuid and "range_id" is not distinct from $3::uuid and "org_unit_id" is not distinct from $4::text and "entity_type" is not distinct from $5::text and "series" is not distinct from $6::text and "agent_id" is not distinct from $7::text and "device_id" is not distinct from $8::text and "shift_id" is not distinct from $9::text and "start_number" is not distinct from $10::bigint and "end_number" is not distinct from $11::bigint and "next_number" is not distinct from $12::bigint and "reserved_at" is not distinct from $13::timestamptz and "valid_until" is not distinct from $14::timestamptz and "status" is not distinct from $15::text and "cancellation_reason" is not distinct from $16::text and "cancelled_by" is not distinct from $17::text and "created_at" is not distinct from $18::timestamptz and "updated_at" is not distinct from $19::timestamptz and "audit_actor_id" is not distinct from $20::text and "settlement_action" is not distinct from $21::text and "settlement_reason" is not distinct from $22::text and "settlement_user_ref" is not distinct from $23::text and "settled_by" is not distinct from $24::text and "idempotency_key" is not distinct from $25::text and "idempotency_fingerprint" is not distinct from $26::text and "reservation_origin" is not distinct from $27::text) as matches from offline."numbering_reservations" where "id"=$1::uuid`,
  params: z.tuple([uuid, uuid, uuid, text, text, text, text, text, text.nullable(), bigint, bigint, bigint, timestamp, timestamp, text, text.nullable(), text.nullable(), timestamp, timestamp.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text]), row: matches, expects: 'many',
});

const importReservationsInsert = defineQuery({
  name: 'offline.importReservationsInsert',
  text: sql`insert into offline."numbering_reservations" ("id","tenant_id","range_id","org_unit_id","entity_type","series","agent_id","device_id","shift_id","start_number","end_number","next_number","reserved_at","valid_until","status","cancellation_reason","cancelled_by","created_at","updated_at","audit_actor_id","settlement_action","settlement_reason","settlement_user_ref","settled_by","idempotency_key","idempotency_fingerprint","reservation_origin") values ($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::bigint,$11::bigint,$12::bigint,$13::timestamptz,$14::timestamptz,$15::text,$16::text,$17::text,$18::timestamptz,$19::timestamptz,$20::text,$21::text,$22::text,$23::text,$24::text,$25::text,$26::text,$27::text)`,
  params: z.tuple([uuid, uuid, uuid, text, text, text, text, text, text.nullable(), bigint, bigint, bigint, timestamp, timestamp, text, text.nullable(), text.nullable(), timestamp, timestamp.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text.nullable(), text]), row: z.object({}), expects: 'none',
});

const importQueueItemsExisting = defineQuery({
  name: 'offline.importQueueItemsExisting',
  text: sql`select ("tenant_id" is not distinct from $1::uuid and "id" is not distinct from $2::text and "device_batch_id" is not distinct from $3::text and "org_unit_id" is not distinct from $4::text and "agent_id" is not distinct from $5::text and "device_id" is not distinct from $6::text and "entity_type" is not distinct from $7::text and "local_entity_id" is not distinct from $8::text and "idempotency_key" is not distinct from $9::text and "payload_hash" is not distinct from $10::text and "payload_json" is not distinct from $11::jsonb and "reserved_number" is not distinct from $12::bigint and "status" is not distinct from $13::text and "created_locally_at" is not distinct from $14::timestamptz and "received_at" is not distinct from $15::timestamptz and "created_at" is not distinct from $16::timestamptz and "updated_at" is not distinct from $17::timestamptz and "identity_mode" is not distinct from $18::text) as matches from offline."sync_queue_items" where "tenant_id"=$1::uuid and "id"=$2::text`,
  params: z.tuple([uuid, text, text, text, text, text, text, text, text, text, text, bigint.nullable(), text, timestamp, timestamp, timestamp, timestamp.nullable(), text]), row: matches, expects: 'many',
});

const importQueueItemsInsert = defineQuery({
  name: 'offline.importQueueItemsInsert',
  text: sql`insert into offline."sync_queue_items" ("tenant_id","id","device_batch_id","org_unit_id","agent_id","device_id","entity_type","local_entity_id","idempotency_key","payload_hash","payload_json","reserved_number","status","created_locally_at","received_at","created_at","updated_at","identity_mode") values ($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::jsonb,$12::bigint,$13::text,$14::timestamptz,$15::timestamptz,$16::timestamptz,$17::timestamptz,$18::text)`,
  params: z.tuple([uuid, text, text, text, text, text, text, text, text, text, text, bigint.nullable(), text, timestamp, timestamp, timestamp, timestamp.nullable(), text]), row: z.object({}), expects: 'none',
});

const importConflictsExisting = defineQuery({
  name: 'offline.importConflictsExisting',
  text: sql`select ("id" is not distinct from $1::uuid and "tenant_id" is not distinct from $2::uuid and "sync_queue_item_id" is not distinct from $3::text and "local_entity_id" is not distinct from $4::text and "payload_hash" is not distinct from $5::text and "conflict_type" is not distinct from $6::text and "description" is not distinct from $7::text and "status" is not distinct from $8::text and "resolution" is not distinct from $9::text and "resolved_by" is not distinct from $10::text and "resolved_at" is not distinct from $11::timestamptz and "created_at" is not distinct from $12::timestamptz and "updated_at" is not distinct from $13::timestamptz and "resolution_reason" is not distinct from $14::text and "resolution_user_ref" is not distinct from $15::text) as matches from offline."sync_conflicts" where "id"=$1::uuid`,
  params: z.tuple([uuid, uuid, text, text, text, text, text, text, text.nullable(), text.nullable(), timestamp.nullable(), timestamp, timestamp.nullable(), text.nullable(), text.nullable()]), row: matches, expects: 'many',
});

const importConflictsInsert = defineQuery({
  name: 'offline.importConflictsInsert',
  text: sql`insert into offline."sync_conflicts" ("id","tenant_id","sync_queue_item_id","local_entity_id","payload_hash","conflict_type","description","status","resolution","resolved_by","resolved_at","created_at","updated_at","resolution_reason","resolution_user_ref") values ($1::uuid,$2::uuid,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::text,$10::text,$11::timestamptz,$12::timestamptz,$13::timestamptz,$14::text,$15::text)`,
  params: z.tuple([uuid, uuid, text, text, text, text, text, text, text.nullable(), text.nullable(), timestamp.nullable(), timestamp, timestamp.nullable(), text.nullable(), text.nullable()]), row: z.object({}), expects: 'none',
});

const importBatchesExisting = defineQuery({
  name: 'offline.importBatchesExisting',
  text: sql`select ("tenant_id" is not distinct from $1::uuid and "device_id" is not distinct from $2::text and "device_batch_id" is not distinct from $3::text and "org_unit_id" is not distinct from $4::text and "agent_id" is not distinct from $5::text and "batch_sequence" is not distinct from $6::bigint and "context_hash" is not distinct from $7::text and "declared_keys" is not distinct from $8::jsonb and "status" is not distinct from $9::text and "lease_token" is not distinct from $10::uuid and "lease_generation" is not distinct from $11::bigint and "lease_expires_at" is not distinct from $12::timestamptz and "transport_key" is not distinct from $13::text and "transport_fingerprint" is not distinct from $14::text and "response_status" is not distinct from $15::integer and "response_body_bytes" is not distinct from $16::bytea and "response_headers" is not distinct from $17::jsonb and "created_at" is not distinct from $18::timestamptz and "updated_at" is not distinct from $19::timestamptz and "initial_queue_status" is not distinct from $20::text and "response_body_is_archived" is not distinct from $21::boolean) as matches from offline."sync_batches" where "tenant_id"=$1::uuid and "device_id"=$2::text and "device_batch_id"=$3::text`,
  params: z.tuple([uuid, text, text, text, text, bigint.nullable(), text, text, text, uuid.nullable(), bigint, timestamp.nullable(), text.nullable(), text.nullable(), z.number().int().min(-2147483648).max(2147483647), z.instanceof(Buffer).nullable(), text, timestamp, timestamp.nullable(), text, z.boolean()]), row: matches, expects: 'many',
});

const importBatchesInsert = defineQuery({
  name: 'offline.importBatchesInsert',
  text: sql`insert into offline."sync_batches" ("tenant_id","device_id","device_batch_id","org_unit_id","agent_id","batch_sequence","context_hash","declared_keys","status","lease_token","lease_generation","lease_expires_at","transport_key","transport_fingerprint","response_status","response_body_bytes","response_headers","created_at","updated_at","initial_queue_status","response_body_is_archived") values ($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::bigint,$7::text,$8::jsonb,$9::text,$10::uuid,$11::bigint,$12::timestamptz,$13::text,$14::text,$15::integer,$16::bytea,$17::jsonb,$18::timestamptz,$19::timestamptz,$20::text,$21::boolean)`,
  params: z.tuple([uuid, text, text, text, text, bigint.nullable(), text, text, text, uuid.nullable(), bigint, timestamp.nullable(), text.nullable(), text.nullable(), z.number().int().min(-2147483648).max(2147483647), z.instanceof(Buffer).nullable(), text, timestamp, timestamp.nullable(), text, z.boolean()]), row: z.object({}), expects: 'none',
});

const importTransportKeysExisting = defineQuery({
  name: 'offline.importTransportKeysExisting',
  text: sql`select ("tenant_id" is not distinct from $1::uuid and "transport_key" is not distinct from $2::text and "device_id" is not distinct from $3::text and "device_batch_id" is not distinct from $4::text and "transport_fingerprint" is not distinct from $5::text and "created_at" is not distinct from $6::timestamptz) as matches from offline."sync_batch_transport_keys" where "tenant_id"=$1::uuid and "transport_key"=$2::text`,
  params: z.tuple([uuid, text, text, text, text, timestamp]), row: matches, expects: 'many',
});

const importTransportKeysInsert = defineQuery({
  name: 'offline.importTransportKeysInsert',
  text: sql`insert into offline."sync_batch_transport_keys" ("tenant_id","transport_key","device_id","device_batch_id","transport_fingerprint","created_at") values ($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::timestamptz)`,
  params: z.tuple([uuid, text, text, text, text, timestamp]), row: z.object({}), expects: 'none',
});

const importReceiptsExisting = defineQuery({
  name: 'offline.importReceiptsExisting',
  text: sql`select ("tenant_id" is not distinct from $1::uuid and "idempotency_key" is not distinct from $2::text and "queue_item_id" is not distinct from $3::text and "device_id" is not distinct from $4::text and "device_batch_id" is not distinct from $5::text and "payload_hash" is not distinct from $6::text and "status" is not distinct from $7::text and "error_code" is not distinct from $8::text and "context_json" is not distinct from $9::jsonb and "received_at" is not distinct from $10::timestamptz and "updated_at" is not distinct from $11::timestamptz) as matches from offline."sync_item_receipts" where "tenant_id"=$1::uuid and "idempotency_key"=$2::text`,
  params: z.tuple([uuid, text, text, text, text, text, text, text.nullable(), text.nullable(), timestamp, timestamp.nullable()]), row: matches, expects: 'many',
});

const importReceiptsInsert = defineQuery({
  name: 'offline.importReceiptsInsert',
  text: sql`insert into offline."sync_item_receipts" ("tenant_id","idempotency_key","queue_item_id","device_id","device_batch_id","payload_hash","status","error_code","context_json","received_at","updated_at") values ($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::timestamptz,$11::timestamptz)`,
  params: z.tuple([uuid, text, text, text, text, text, text, text.nullable(), text.nullable(), timestamp, timestamp.nullable()]), row: z.object({}), expects: 'none',
});

const importAttemptsExisting = defineQuery({
  name: 'offline.importAttemptsExisting',
  text: sql`select ("tenant_id" is not distinct from $1::uuid and "device_id" is not distinct from $2::text and "device_batch_id" is not distinct from $3::text and "queue_item_id" is not distinct from $4::text and "idempotency_key" is not distinct from $5::text and "payload_hash" is not distinct from $6::text and "status" is not distinct from $7::text and "error_code" is not distinct from $8::text and "context_json" is not distinct from $9::jsonb and "created_at" is not distinct from $10::timestamptz) as matches from offline."sync_item_attempts" where "tenant_id"=$1::uuid and "device_id"=$2::text and "device_batch_id"=$3::text and "queue_item_id"=$4::text`,
  params: z.tuple([uuid, text, text, text, text, text, text, text.nullable(), text.nullable(), timestamp]), row: matches, expects: 'many',
});

const importAttemptsInsert = defineQuery({
  name: 'offline.importAttemptsInsert',
  text: sql`insert into offline."sync_item_attempts" ("tenant_id","device_id","device_batch_id","queue_item_id","idempotency_key","payload_hash","status","error_code","context_json","created_at") values ($1::uuid,$2::text,$3::text,$4::text,$5::text,$6::text,$7::text,$8::text,$9::jsonb,$10::timestamptz)`,
  params: z.tuple([uuid, text, text, text, text, text, text, text.nullable(), text.nullable(), timestamp]), row: z.object({}), expects: 'none',
});

const importConsumptionExisting = defineQuery({
  name: 'offline.importConsumptionExisting',
  text: sql`select ("tenant_id" is not distinct from $1::uuid and "reservation_id" is not distinct from $2::uuid and "number" is not distinct from $3::bigint and "status" is not distinct from $4::text and "server_entity_id" is not distinct from $5::text and "finalized_at" is not distinct from $6::timestamptz) as matches from offline."numbering_consumption" where "tenant_id"=$1::uuid and "reservation_id"=$2::uuid and "number"=$3::bigint`,
  params: z.tuple([uuid, uuid, bigint, text, text.nullable(), timestamp.nullable()]), row: matches, expects: 'many',
});

const importConsumptionInsert = defineQuery({
  name: 'offline.importConsumptionInsert',
  text: sql`insert into offline."numbering_consumption" ("tenant_id","reservation_id","number","status","server_entity_id","finalized_at") values ($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::timestamptz)`,
  params: z.tuple([uuid, uuid, bigint, text, text.nullable(), timestamp.nullable()]), row: z.object({}), expects: 'none',
});

const importConflictEvidenceExisting = defineQuery({
  name: 'offline.importConflictEvidenceExisting',
  text: sql`select ("tenant_id" is not distinct from $1::uuid and "conflict_id" is not distinct from $2::uuid and "queue_item_id" is not distinct from $3::text and "related_queue_item_id" is not distinct from $4::text and "allowed_actions" is not distinct from $5::jsonb and "evidence" is not distinct from $6::jsonb and "created_at" is not distinct from $7::timestamptz) as matches from offline."sync_conflict_evidence" where "tenant_id"=$1::uuid and "conflict_id"=$2::uuid and "queue_item_id"=$3::text`,
  params: z.tuple([uuid, uuid, text, text.nullable(), text, text, timestamp]), row: matches, expects: 'many',
});

const importConflictEvidenceInsert = defineQuery({
  name: 'offline.importConflictEvidenceInsert',
  text: sql`insert into offline."sync_conflict_evidence" ("tenant_id","conflict_id","queue_item_id","related_queue_item_id","allowed_actions","evidence","created_at") values ($1::uuid,$2::uuid,$3::text,$4::text,$5::jsonb,$6::jsonb,$7::timestamptz)`,
  params: z.tuple([uuid, uuid, text, text.nullable(), text, text, timestamp]), row: z.object({}), expects: 'none',
});

const importConflictActionsExisting = defineQuery({
  name: 'offline.importConflictActionsExisting',
  text: sql`select ("id" is not distinct from $1::uuid and "tenant_id" is not distinct from $2::uuid and "conflict_id" is not distinct from $3::uuid and "action" is not distinct from $4::text and "reason" is not distinct from $5::text and "user_ref" is not distinct from $6::text and "actor_id" is not distinct from $7::text and "resulting_status" is not distinct from $8::text and "created_at" is not distinct from $9::timestamptz) as matches from offline."sync_conflict_actions" where "tenant_id"=$2::uuid and "id"=$1::uuid`,
  params: z.tuple([uuid, uuid, uuid, text, text.nullable(), text.nullable(), text, text, timestamp]), row: matches, expects: 'many',
});

const importConflictActionsInsert = defineQuery({
  name: 'offline.importConflictActionsInsert',
  text: sql`insert into offline."sync_conflict_actions" ("id","tenant_id","conflict_id","action","reason","user_ref","actor_id","resulting_status","created_at") values ($1::uuid,$2::uuid,$3::uuid,$4::text,$5::text,$6::text,$7::text,$8::text,$9::timestamptz)`,
  params: z.tuple([uuid, uuid, uuid, text, text.nullable(), text.nullable(), text, text, timestamp]), row: z.object({}), expects: 'none',
});

const importReconciliationsExisting = defineQuery({
  name: 'offline.importReconciliationsExisting',
  text: sql`select ("id" is not distinct from $1::uuid and "tenant_id" is not distinct from $2::uuid and "reservation_id" is not distinct from $3::uuid and "actor_id" is not distinct from $4::text and "created_at" is not distinct from $5::timestamptz and "claimed_numbers" is not distinct from $6::bigint[] and "user_ref" is not distinct from $7::text and "idempotency_key" is not distinct from $8::text and "request_fingerprint" is not distinct from $9::text and "result_json" is not distinct from $10::jsonb) as matches from offline."numbering_reconciliations" where "tenant_id"=$2::uuid and "id"=$1::uuid`,
  params: z.tuple([uuid, uuid, uuid, text, timestamp, z.array(bigint), text.nullable(), text.nullable(), text.nullable(), text]), row: matches, expects: 'many',
});

const importReconciliationsInsert = defineQuery({
  name: 'offline.importReconciliationsInsert',
  text: sql`insert into offline."numbering_reconciliations" ("id","tenant_id","reservation_id","actor_id","created_at","claimed_numbers","user_ref","idempotency_key","request_fingerprint","result_json") values ($1::uuid,$2::uuid,$3::uuid,$4::text,$5::timestamptz,$6::bigint[],$7::text,$8::text,$9::text,$10::jsonb)`,
  params: z.tuple([uuid, uuid, uuid, text, timestamp, z.array(bigint), text.nullable(), text.nullable(), text.nullable(), text]), row: z.object({}), expects: 'none',
});

export const importOperations = Object.freeze({
  ranges: Object.freeze({
    fields: [
      { source: 'id', target: 'id', cast: 'uuid' },
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'org_unit_id', target: 'org_unit_id', cast: 'text' },
      { source: 'entity_type', target: 'entity_type', cast: 'text' },
      { source: 'series', target: 'series', cast: 'text' },
      { source: 'start_number', target: 'start_number', cast: 'bigint' },
      { source: 'end_number', target: 'end_number', cast: 'bigint' },
      { source: 'next_number', target: 'next_number', cast: 'bigint' },
      { source: 'status', target: 'status', cast: 'text' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
      { source: 'updated_at', target: 'updated_at', cast: 'timestamptz' },
      { source: 'consumer_attributes', target: 'consumer_attributes', cast: 'json' },
      { source: 'created_by', target: 'created_by', cast: 'text' },
      { source: 'creation_key', target: 'creation_key', cast: 'text' },
      { source: 'creation_fingerprint', target: 'creation_fingerprint', cast: 'text' },
      { source: 'creation_receipt', target: 'creation_receipt', cast: 'jsonb' },
      { source: 'cancelled_by', target: 'cancelled_by', cast: 'text' },
      { source: 'cancellation_reason', target: 'cancellation_reason', cast: 'text' },
      { source: 'cancelled_at', target: 'cancelled_at', cast: 'timestamptz' },
    ],
    existing: importRangesExisting, insert: importRangesInsert,
  }),
  reservations: Object.freeze({
    fields: [
      { source: 'id', target: 'id', cast: 'uuid' },
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'range_id', target: 'range_id', cast: 'uuid' },
      { source: 'org_unit_id', target: 'org_unit_id', cast: 'text' },
      { source: 'entity_type', target: 'entity_type', cast: 'text' },
      { source: 'series', target: 'series', cast: 'text' },
      { source: 'agent_id', target: 'agent_id', cast: 'text' },
      { source: 'device_id', target: 'device_id', cast: 'text' },
      { source: 'shift_id', target: 'shift_id', cast: 'text' },
      { source: 'start_number', target: 'start_number', cast: 'bigint' },
      { source: 'end_number', target: 'end_number', cast: 'bigint' },
      { source: 'next_number', target: 'next_number', cast: 'bigint' },
      { source: 'reserved_at', target: 'reserved_at', cast: 'timestamptz' },
      { source: 'valid_until', target: 'valid_until', cast: 'timestamptz' },
      { source: 'status', target: 'status', cast: 'text' },
      { source: 'cancellation_reason', target: 'cancellation_reason', cast: 'text' },
      { source: 'cancelled_by', target: 'cancelled_by', cast: 'text' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
      { source: 'updated_at', target: 'updated_at', cast: 'timestamptz' },
      { source: 'audit_actor_id', target: 'audit_actor_id', cast: 'text' },
      { source: 'settlement_action', target: 'settlement_action', cast: 'text' },
      { source: 'settlement_reason', target: 'settlement_reason', cast: 'text' },
      { source: 'settlement_user_ref', target: 'settlement_user_ref', cast: 'text' },
      { source: 'settled_by', target: 'settled_by', cast: 'text' },
      { source: 'idempotency_key', target: 'idempotency_key', cast: 'text' },
      { source: 'idempotency_fingerprint', target: 'idempotency_fingerprint', cast: 'text' },
      { source: 'reservation_origin', target: 'reservation_origin', cast: 'text' },
    ],
    existing: importReservationsExisting, insert: importReservationsInsert,
  }),
  queueItems: Object.freeze({
    fields: [
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'id', target: 'id', cast: 'text' },
      { source: 'device_batch_id', target: 'device_batch_id', cast: 'text' },
      { source: 'org_unit_id', target: 'org_unit_id', cast: 'text' },
      { source: 'agent_id', target: 'agent_id', cast: 'text' },
      { source: 'device_id', target: 'device_id', cast: 'text' },
      { source: 'entity_type', target: 'entity_type', cast: 'text' },
      { source: 'local_entity_id', target: 'local_entity_id', cast: 'text' },
      { source: 'idempotency_key', target: 'idempotency_key', cast: 'text' },
      { source: 'payload_hash', target: 'payload_hash', cast: 'text' },
      { source: 'payload_json', target: 'payload_json', cast: 'jsonb' },
      { source: 'reserved_number', target: 'reserved_number', cast: 'bigint' },
      { source: 'status', target: 'status', cast: 'text' },
      { source: 'created_locally_at', target: 'created_locally_at', cast: 'timestamptz' },
      { source: 'received_at', target: 'received_at', cast: 'timestamptz' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
      { source: 'updated_at', target: 'updated_at', cast: 'timestamptz' },
      { source: 'identity_mode', target: 'identity_mode', cast: 'text' },
    ],
    existing: importQueueItemsExisting, insert: importQueueItemsInsert,
  }),
  conflicts: Object.freeze({
    fields: [
      { source: 'id', target: 'id', cast: 'uuid' },
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'sync_queue_item_id', target: 'sync_queue_item_id', cast: 'text' },
      { source: 'local_entity_id', target: 'local_entity_id', cast: 'text' },
      { source: 'payload_hash', target: 'payload_hash', cast: 'text' },
      { source: 'conflict_type', target: 'conflict_type', cast: 'text' },
      { source: 'description', target: 'description', cast: 'text' },
      { source: 'status', target: 'status', cast: 'text' },
      { source: 'resolution', target: 'resolution', cast: 'text' },
      { source: 'resolved_by', target: 'resolved_by', cast: 'text' },
      { source: 'resolved_at', target: 'resolved_at', cast: 'timestamptz' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
      { source: 'updated_at', target: 'updated_at', cast: 'timestamptz' },
      { source: 'resolution_reason', target: 'resolution_reason', cast: 'text' },
      { source: 'resolution_user_ref', target: 'resolution_user_ref', cast: 'text' },
    ],
    existing: importConflictsExisting, insert: importConflictsInsert,
  }),
  batches: Object.freeze({
    fields: [
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'device_id', target: 'device_id', cast: 'text' },
      { source: 'device_batch_id', target: 'device_batch_id', cast: 'text' },
      { source: 'org_unit_id', target: 'org_unit_id', cast: 'text' },
      { source: 'agent_id', target: 'agent_id', cast: 'text' },
      { source: 'batch_sequence', target: 'batch_sequence', cast: 'bigint' },
      { source: 'context_hash', target: 'context_hash', cast: 'text' },
      { source: 'declared_keys', target: 'declared_keys', cast: 'jsonb' },
      { source: 'status', target: 'status', cast: 'text' },
      { source: 'lease_token', target: 'lease_token', cast: 'uuid' },
      { source: 'lease_generation', target: 'lease_generation', cast: 'bigint' },
      { source: 'lease_expires_at', target: 'lease_expires_at', cast: 'timestamptz' },
      { source: 'transport_key', target: 'transport_key', cast: 'text' },
      { source: 'transport_fingerprint', target: 'transport_fingerprint', cast: 'text' },
      { source: 'response_status', target: 'response_status', cast: 'integer' },
      { source: 'response_body_base64', target: 'response_body_bytes', cast: 'bytea' },
      { source: 'response_headers', target: 'response_headers', cast: 'jsonb' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
      { source: 'updated_at', target: 'updated_at', cast: 'timestamptz' },
      { source: 'initial_queue_status', target: 'initial_queue_status', cast: 'text' },
      { source: 'response_body_is_archived', target: 'response_body_is_archived', cast: 'boolean' },
    ],
    existing: importBatchesExisting, insert: importBatchesInsert,
  }),
  transportKeys: Object.freeze({
    fields: [
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'transport_key', target: 'transport_key', cast: 'text' },
      { source: 'device_id', target: 'device_id', cast: 'text' },
      { source: 'device_batch_id', target: 'device_batch_id', cast: 'text' },
      { source: 'transport_fingerprint', target: 'transport_fingerprint', cast: 'text' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
    ],
    existing: importTransportKeysExisting, insert: importTransportKeysInsert,
  }),
  receipts: Object.freeze({
    fields: [
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'idempotency_key', target: 'idempotency_key', cast: 'text' },
      { source: 'queue_item_id', target: 'queue_item_id', cast: 'text' },
      { source: 'device_id', target: 'device_id', cast: 'text' },
      { source: 'device_batch_id', target: 'device_batch_id', cast: 'text' },
      { source: 'payload_hash', target: 'payload_hash', cast: 'text' },
      { source: 'status', target: 'status', cast: 'text' },
      { source: 'error_code', target: 'error_code', cast: 'text' },
      { source: 'context_json', target: 'context_json', cast: 'jsonb' },
      { source: 'received_at', target: 'received_at', cast: 'timestamptz' },
      { source: 'updated_at', target: 'updated_at', cast: 'timestamptz' },
    ],
    existing: importReceiptsExisting, insert: importReceiptsInsert,
  }),
  attempts: Object.freeze({
    fields: [
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'device_id', target: 'device_id', cast: 'text' },
      { source: 'device_batch_id', target: 'device_batch_id', cast: 'text' },
      { source: 'queue_item_id', target: 'queue_item_id', cast: 'text' },
      { source: 'idempotency_key', target: 'idempotency_key', cast: 'text' },
      { source: 'payload_hash', target: 'payload_hash', cast: 'text' },
      { source: 'status', target: 'status', cast: 'text' },
      { source: 'error_code', target: 'error_code', cast: 'text' },
      { source: 'context_json', target: 'context_json', cast: 'jsonb' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
    ],
    existing: importAttemptsExisting, insert: importAttemptsInsert,
  }),
  consumption: Object.freeze({
    fields: [
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'reservation_id', target: 'reservation_id', cast: 'uuid' },
      { source: 'number', target: 'number', cast: 'bigint' },
      { source: 'status', target: 'status', cast: 'text' },
      { source: 'server_entity_id', target: 'server_entity_id', cast: 'text' },
      { source: 'finalized_at', target: 'finalized_at', cast: 'timestamptz' },
    ],
    existing: importConsumptionExisting, insert: importConsumptionInsert,
  }),
  conflictEvidence: Object.freeze({
    fields: [
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'conflict_id', target: 'conflict_id', cast: 'uuid' },
      { source: 'queue_item_id', target: 'queue_item_id', cast: 'text' },
      { source: 'related_queue_item_id', target: 'related_queue_item_id', cast: 'text' },
      { source: 'allowed_actions', target: 'allowed_actions', cast: 'jsonb' },
      { source: 'evidence', target: 'evidence', cast: 'jsonb' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
    ],
    existing: importConflictEvidenceExisting, insert: importConflictEvidenceInsert,
  }),
  conflictActions: Object.freeze({
    fields: [
      { source: 'id', target: 'id', cast: 'uuid' },
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'conflict_id', target: 'conflict_id', cast: 'uuid' },
      { source: 'action', target: 'action', cast: 'text' },
      { source: 'reason', target: 'reason', cast: 'text' },
      { source: 'user_ref', target: 'user_ref', cast: 'text' },
      { source: 'actor_id', target: 'actor_id', cast: 'text' },
      { source: 'resulting_status', target: 'resulting_status', cast: 'text' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
    ],
    existing: importConflictActionsExisting, insert: importConflictActionsInsert,
  }),
  reconciliations: Object.freeze({
    fields: [
      { source: 'id', target: 'id', cast: 'uuid' },
      { source: 'tenant_id', target: 'tenant_id', cast: 'uuid' },
      { source: 'reservation_id', target: 'reservation_id', cast: 'uuid' },
      { source: 'actor_id', target: 'actor_id', cast: 'text' },
      { source: 'created_at', target: 'created_at', cast: 'timestamptz' },
      { source: 'claimed_numbers', target: 'claimed_numbers', cast: 'bigint[]' },
      { source: 'user_ref', target: 'user_ref', cast: 'text' },
      { source: 'idempotency_key', target: 'idempotency_key', cast: 'text' },
      { source: 'request_fingerprint', target: 'request_fingerprint', cast: 'text' },
      { source: 'result_json', target: 'result_json', cast: 'jsonb' },
    ],
    existing: importReconciliationsExisting, insert: importReconciliationsInsert,
  }),
} as const);

export const importAdmission = defineQuery({
  name: 'offline.importAdmission',
  text: sql`select current_user::text as owner,current_setting('transaction_read_only') as readonly,current_setting('transaction_isolation') as isolation`,
  params: z.tuple([]), row: z.object({ owner: text, readonly: text, isolation: text }), expects: 'many',
});

export const lockImportPopulation = defineQuery({
  name: 'offline.lockImportPopulation',
  text: sql`lock table offline."numbering_consumption",offline."numbering_ranges",offline."numbering_reconciliations",offline."numbering_reservation_scopes",offline."numbering_reservations",offline."sync_batch_transport_keys",offline."sync_batches",offline."sync_conflict_actions",offline."sync_conflict_evidence",offline."sync_conflicts",offline."sync_import_receipts",offline."sync_item_attempts",offline."sync_item_receipts",offline."sync_queue_items" in access exclusive mode`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});

export const importLiveTargetLeases = defineQuery({
  name: 'offline.importLiveTargetLeases',
  text: sql`select count(*)::text as count from offline.sync_batches where lease_token is not null and lease_expires_at>clock_timestamp()`,
  params: z.tuple([]), row: z.object({ count: text.regex(/^\d+$/u) }), expects: 'many',
});

export const importPriorReceipt = defineQuery({
  name: 'offline.importPriorReceipt',
  text: sql`select source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,
       original_manifest,imported_by,(extract(epoch from imported_at)*1000000)::numeric(30,0)::text as imported_us,receipt
       from offline.sync_import_receipts where source_identity_sha256=$1`,
  params: z.tuple([text]), row: z.object({ source_identity_sha256: text, source_system: text, source_snapshot_id: text, source_sha256: text, manifest_sha256: text, mapping_sha256: text, original_manifest: z.json(), imported_by: text, imported_us: text.regex(/^-?\d+$/u), receipt: z.json() }), expects: 'many',
});

export const importOwnerClock = defineQuery({
  name: 'offline.importOwnerClock',
  text: sql`select to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
        (extract(epoch from at)*1000000)::numeric(30,0)::text as us from (select clock_timestamp() as at) observation`,
  params: z.tuple([]), row: z.object({ at: text, us: text.regex(/^-?\d+$/u) }), expects: 'many',
});

export const populateImportedScopes = defineQuery({
  name: 'offline.populateImportedScopes',
  text: sql`insert into offline.numbering_reservation_scopes (tenant_id,device_id,shift_scope,generation)
      select tenant_id,device_id,shift_scope,gen_random_uuid() from (
        select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
        from offline.numbering_reservations) missing
      on conflict (tenant_id,device_id,shift_scope) do nothing`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});

export const insertImportReceipt = defineQuery({
  name: 'offline.insertImportReceipt',
  text: sql`insert into offline.sync_import_receipts
      (source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,original_manifest,imported_by,imported_at,receipt)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz,$10::jsonb)`,
  params: z.tuple([text, text, text, text, text, text, text, text, timestamp, text]), row: z.object({}), expects: 'none',
});

export const abortImportTransaction = defineQuery({
  name: 'offline.abortImportTransaction',
  text: sql`select 1 / 0`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});
