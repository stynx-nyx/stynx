import type { Database } from '@stynx-nyx/data';
import { OfflineSyncUpgradeRequiredError } from './errors';
import { decodeCursor, finishPage, listDefaultLimit, pgSortInstant } from './listing';
import type {
  ListSyncBatchReceiptsInput, ListSyncConflictsInput, ListSyncItemReceiptsInput, ListSyncQueueItemsInput,
  OfflineSyncConflictResolutionStrategy, OfflineSyncPage, SyncBatchReceiptSummary, SyncConflictRecord,
  SyncItemReceiptRecord, SyncQueueItemRecord, TrustedOfflineSyncScope,
} from './types';

type Sorted = { sort_at: string };
const iso = (value: Date | string): string => new Date(value).toISOString();

async function page<R extends Sorted, T>(database: Database, sql: string, values: unknown[], limit: number | undefined,
  key: (row: R) => string[], map: (row: R) => T): Promise<OfflineSyncPage<T>> {
  const size = limit ?? listDefaultLimit;
  try {
    const rows = (await database.tx(trx => trx.query<R>(sql, [...values, size + 1]))).rows;
    return finishPage(rows.map(row => ({ key: [row.sort_at, ...key(row)], value: map(row) })), size);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === '42703' || code === '42P01') throw new OfflineSyncUpgradeRequiredError();
    throw error;
  }
}

/** Tenant batch receipts, newest `created_at` first, tie-broken by device and batch id (C collation). */
export function pgListBatches(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncBatchReceiptsInput): Promise<OfflineSyncPage<SyncBatchReceiptSummary>> {
  const after = decodeCursor(input.cursor, 3);
  return page<Sorted & { device_id: string; device_batch_id: string; batch_sequence: string | null; status: SyncBatchReceiptSummary['status']; response_status: number | null; created_at: Date }, SyncBatchReceiptSummary>(database,
    `select device_id,device_batch_id,batch_sequence,status,response_status,created_at,${pgSortInstant('created_at')} as sort_at
       from offline.sync_batches
      where tenant_id=$1::uuid and ($2::text is null or device_id=$2) and ($3::text is null or status=$3)
        and ($4::timestamptz is null or (created_at,device_id collate "C",device_batch_id collate "C") < ($4::timestamptz,$5::text collate "C",$6::text collate "C"))
      order by created_at desc,device_id collate "C" desc,device_batch_id collate "C" desc limit $7`,
    [scope.tenantId, input.deviceId ?? null, input.status ?? null, after?.[0] ?? null, after?.[1] ?? null, after?.[2] ?? null], input.limit,
    row => [row.device_id, row.device_batch_id],
    row => ({ deviceId: row.device_id, deviceBatchId: row.device_batch_id, batchSequence: row.batch_sequence === null ? null : Number(row.batch_sequence),
      status: row.status, responseStatus: row.response_status, createdAt: iso(row.created_at) }));
}

/** Tenant item receipts, newest `received_at` first, tie-broken by receipt id (C collation). */
export function pgListItemReceipts(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncItemReceiptsInput): Promise<OfflineSyncPage<SyncItemReceiptRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page<Sorted & { idempotency_key: string; queue_item_id: string; device_id: string; device_batch_id: string; payload_hash: string; status: SyncItemReceiptRecord['status']; error_code: string | null; context_json: Record<string, unknown> | null; received_at: Date }, SyncItemReceiptRecord>(database,
    `select idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,error_code,context_json,received_at,${pgSortInstant('received_at')} as sort_at
       from offline.sync_item_receipts
      where tenant_id=$1::uuid and ($2::text is null or device_id=$2) and ($3::text is null or device_batch_id=$3) and ($4::text is null or status=$4)
        and ($5::timestamptz is null or (received_at,idempotency_key collate "C") < ($5::timestamptz,$6::text collate "C"))
      order by received_at desc,idempotency_key collate "C" desc limit $7`,
    [scope.tenantId, input.deviceId ?? null, input.deviceBatchId ?? null, input.status ?? null, after?.[0] ?? null, after?.[1] ?? null], input.limit,
    row => [row.idempotency_key],
    row => ({ receiptId: row.idempotency_key, queueItemId: row.queue_item_id, deviceId: row.device_id, deviceBatchId: row.device_batch_id,
      payloadHash: row.payload_hash, status: row.status, ...(row.error_code ? { errorCode: row.error_code } : {}),
      ...(row.context_json ? { context: row.context_json } : {}), receivedAt: iso(row.received_at) }));
}

/** Tenant queue items (E6 and CTG9), newest `received_at` first, tie-broken by queue item id (C collation). */
export function pgListQueueItems(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncQueueItemsInput): Promise<OfflineSyncPage<SyncQueueItemRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page<Sorted & { id: string; tenant_id: string; device_batch_id: string; org_unit_id: string; agent_id: string; device_id: string; entity_type: string; local_entity_id: string; idempotency_key: string; payload_hash: string; payload_json: Record<string, unknown>; created_locally_at: Date; reserved_number: string | null; status: SyncQueueItemRecord['status']; received_at: Date }, SyncQueueItemRecord>(database,
    `select id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,idempotency_key,payload_hash,
            payload_json,created_locally_at,reserved_number,status,received_at,${pgSortInstant('received_at')} as sort_at
       from offline.sync_queue_items
      where tenant_id=$1::uuid and ($2::text is null or device_id=$2) and ($3::text is null or status=$3) and ($4::text is null or entity_type=$4)
        and ($5::timestamptz is null or (received_at,id collate "C") < ($5::timestamptz,$6::text collate "C"))
      order by received_at desc,id collate "C" desc limit $7`,
    [scope.tenantId, input.deviceId ?? null, input.status ?? null, input.entityType ?? null, after?.[0] ?? null, after?.[1] ?? null], input.limit,
    row => [row.id],
    row => ({ queueItemId: row.id, tenantId: row.tenant_id, deviceBatchId: row.device_batch_id, orgUnitId: row.org_unit_id, agentId: row.agent_id,
      deviceId: row.device_id, entityType: row.entity_type, localEntityId: row.local_entity_id, idempotencyKey: row.idempotency_key,
      payloadHash: row.payload_hash, payloadJson: row.payload_json, createdLocallyAt: iso(row.created_locally_at),
      ...(row.reserved_number === null ? {} : { reservedNumber: Number(row.reserved_number) }), status: row.status, receivedAt: iso(row.received_at) }));
}

/** Tenant conflicts, newest `created_at` first, tie-broken by conflict id. */
export function pgListConflicts(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncConflictsInput): Promise<OfflineSyncPage<SyncConflictRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page<Sorted & { id: string; tenant_id: string; sync_queue_item_id: string; local_entity_id: string; payload_hash: string; conflict_type: string; description: string; status: SyncConflictRecord['status']; resolution: OfflineSyncConflictResolutionStrategy | null; resolved_by: string | null; resolved_at: Date | null; created_at: Date }, SyncConflictRecord>(database,
    `select id,tenant_id,sync_queue_item_id,local_entity_id,payload_hash,conflict_type,description,status,resolution,resolved_by,resolved_at,created_at,
            ${pgSortInstant('created_at')} as sort_at
       from offline.sync_conflicts
      where tenant_id=$1::uuid and ($2::text is null or status=$2) and ($3::text is null or conflict_type=$3) and ($4::text is null or sync_queue_item_id=$4)
        and ($5::timestamptz is null or (created_at,id::text collate "C") < ($5::timestamptz,$6::text collate "C"))
      order by created_at desc,id::text collate "C" desc limit $7`,
    [scope.tenantId, input.status ?? null, input.conflictType ?? null, input.queueItemId ?? null, after?.[0] ?? null, after?.[1] ?? null], input.limit,
    row => [row.id],
    row => ({ conflictId: row.id, tenantId: row.tenant_id, queueItemId: row.sync_queue_item_id, localEntityId: row.local_entity_id,
      payloadHash: row.payload_hash, conflictType: row.conflict_type, description: row.description, status: row.status,
      ...(row.resolution === null ? {} : { resolution: row.resolution }), ...(row.resolved_by === null ? {} : { resolvedBy: row.resolved_by }),
      ...(row.resolved_at === null ? {} : { resolvedAt: iso(row.resolved_at) }), createdAt: iso(row.created_at) }));
}
