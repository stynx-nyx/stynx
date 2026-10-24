import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const nullableText = text.nullable();
const bigint = z.union([text.regex(/^-?\d+$/u), z.number().refine(Number.isInteger)]);
const instant = text;
const timestamp = z.union([z.instanceof(Date), instant, z.literal(Infinity), z.literal(-Infinity)]);
const jsonObject = z.record(text, z.json());
const queueStatus = z.enum(['received', 'applied', 'conflict', 'rejected', 'pending']);
const conflictStatus = z.enum(['open', 'resolved']);
const strategy = z.enum(['device-wins', 'server-wins', 'manual-review', 'accept_server', 'reject', 'retry_after_correction', 'manual_review']);
const pageLimit = z.number().int().nonnegative().max(2147483647);

export const listBatches = defineQuery({
  name: 'offline.listBatches',
  text: sql`select device_id,device_batch_id,batch_sequence,status,response_status,created_at,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sort_at
       from offline.sync_batches
      where tenant_id=$1::uuid and ($2::text is null or device_id=$2) and ($3::text is null or status=$3)
        and ($4::timestamptz is null or (created_at,device_id collate "C",device_batch_id collate "C") < ($4::timestamptz,$5::text collate "C",$6::text collate "C"))
      order by created_at desc,device_id collate "C" desc,device_batch_id collate "C" desc limit $7`,
  params: z.tuple([uuid, nullableText, nullableText, instant.nullable(), nullableText, nullableText, pageLimit]), row: z.object({ device_id: text, device_batch_id: text, batch_sequence: bigint.nullable(), status: z.enum(['open', 'closed', 'legacy_closed_unverified']), response_status: z.number().int().nullable(), created_at: timestamp, sort_at: instant.nullable() }), expects: 'many',
});

export const listItemReceipts = defineQuery({
  name: 'offline.listItemReceipts',
  text: sql`select idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,error_code,context_json,received_at,to_char(received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sort_at
       from offline.sync_item_receipts
      where tenant_id=$1::uuid and ($2::text is null or device_id=$2) and ($3::text is null or device_batch_id=$3) and ($4::text is null or status=$4)
        and ($5::timestamptz is null or (received_at,idempotency_key collate "C") < ($5::timestamptz,$6::text collate "C"))
      order by received_at desc,idempotency_key collate "C" desc limit $7`,
  params: z.tuple([uuid, nullableText, nullableText, nullableText, instant.nullable(), nullableText, pageLimit]), row: z.object({ idempotency_key: text, queue_item_id: text, device_id: text, device_batch_id: text, payload_hash: text, status: queueStatus, error_code: nullableText, context_json: jsonObject.nullable(), received_at: timestamp, sort_at: instant.nullable() }), expects: 'many',
});

export const listQueueItems = defineQuery({
  name: 'offline.listQueueItems',
  text: sql`select q.id,q.tenant_id,q.device_batch_id,q.org_unit_id,q.agent_id,q.device_id,q.entity_type,q.local_entity_id,q.idempotency_key,q.payload_hash,
            q.payload_json,q.created_locally_at,q.reserved_number,q.status,q.received_at,to_char(q.received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sort_at,r.context_json->'stynx' as stynx
       from offline.sync_queue_items q
       left join offline.sync_item_receipts r on r.tenant_id=q.tenant_id and r.idempotency_key=q.idempotency_key
      where q.tenant_id=$1::uuid and ($2::text is null or q.device_id=$2) and ($3::text is null or q.status=$3) and ($4::text is null or q.entity_type=$4)
        and ($5::timestamptz is null or (q.received_at,q.id collate "C") < ($5::timestamptz,$6::text collate "C"))
      order by q.received_at desc,q.id collate "C" desc limit $7`,
  params: z.tuple([uuid, nullableText, nullableText, nullableText, instant.nullable(), nullableText, pageLimit]), row: z.object({ id: text, tenant_id: uuid, device_batch_id: text, org_unit_id: text, agent_id: text, device_id: text, entity_type: text, local_entity_id: text, idempotency_key: text, payload_hash: text, payload_json: jsonObject, created_locally_at: timestamp, reserved_number: bigint.nullable(), status: queueStatus, received_at: timestamp, sort_at: instant.nullable(), stynx: jsonObject.nullable() }), expects: 'many',
});

export const listConflicts = defineQuery({
  name: 'offline.listConflicts',
  text: sql`select c.id,c.tenant_id,c.sync_queue_item_id,c.local_entity_id,c.payload_hash,c.conflict_type,c.description,c.status,c.resolution,c.resolved_by,c.resolved_at,c.created_at,
            q.device_id,to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sort_at,e.evidence->'stynx' as stynx
       from offline.sync_conflicts c
       join offline.sync_queue_items q on q.tenant_id=c.tenant_id and q.id=c.sync_queue_item_id
       left join offline.sync_conflict_evidence e on e.tenant_id=c.tenant_id and e.conflict_id=c.id and e.queue_item_id=c.sync_queue_item_id
      where c.tenant_id=$1::uuid and ($2::text is null or c.status=$2) and ($3::text is null or c.conflict_type=$3) and ($4::text is null or c.sync_queue_item_id=$4)
        and ($5::text is null or q.device_id=$5)
        and ($6::timestamptz is null or (c.created_at,c.id::text collate "C") < ($6::timestamptz,$7::text collate "C"))
      order by c.created_at desc,c.id::text collate "C" desc limit $8`,
  params: z.tuple([uuid, nullableText, nullableText, nullableText, nullableText, instant.nullable(), nullableText, pageLimit]), row: z.object({ id: uuid, tenant_id: uuid, sync_queue_item_id: text, local_entity_id: text, payload_hash: text, conflict_type: text, description: text, status: conflictStatus, resolution: strategy.nullable(), resolved_by: nullableText, resolved_at: timestamp.nullable(), created_at: timestamp, device_id: text, sort_at: instant.nullable(), stynx: jsonObject.nullable() }), expects: 'many',
});

export const listConflictActions = defineQuery({
  name: 'offline.listConflictActions',
  text: sql`select id,tenant_id,conflict_id,action,reason,user_ref,actor_id,resulting_status,created_at,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sort_at
       from offline.sync_conflict_actions
      where tenant_id=$1::uuid and conflict_id=$2::uuid
        and ($3::timestamptz is null or (created_at,id::text collate "C") < ($3::timestamptz,$4::text collate "C"))
      order by created_at desc,id::text collate "C" desc limit $5`,
  params: z.tuple([uuid, uuid, instant.nullable(), nullableText, pageLimit]), row: z.object({ id: uuid, tenant_id: uuid, conflict_id: uuid, action: strategy, reason: nullableText, user_ref: nullableText, actor_id: text, resulting_status: conflictStatus, created_at: timestamp, sort_at: instant.nullable() }), expects: 'many',
});

