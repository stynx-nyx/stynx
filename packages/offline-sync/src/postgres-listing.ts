import type { Database } from '@stynx-nyx/data';
import { OfflineSyncUpgradeRequiredError } from './errors';
import { decodeCursor, finishPage, listDefaultLimit, pgSortInstant } from './listing';
import { splitStynxContext } from './stynx-context';
import type {
  ListSyncBatchReceiptsInput, ListSyncConflictActionsInput, ListSyncConflictsInput, ListSyncItemReceiptsInput, ListSyncQueueItemsInput,
  OfflineSyncConflictResolutionStrategy, OfflineSyncPage, OfflineSyncStynxContext, SyncBatchReceiptSummary, SyncConflictActionRecord, SyncConflictRecord,
  SyncItemReceiptRecord, SyncQueueItemRecord, TrustedOfflineSyncScope,
} from './types';

type Sorted = { sort_at: string };
const iso = (value: Date | string): string => new Date(value).toISOString();
/** D3.5: the platform object stored under the reserved key, exposed as the typed `stynx` property. */
const platformOf = (stored: Record<string, unknown> | null): { stynx?: OfflineSyncStynxContext } =>
  splitStynxContext(stored === null ? null : { stynx: stored });

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
export async function pgListBatches(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncBatchReceiptsInput): Promise<OfflineSyncPage<SyncBatchReceiptSummary>> {
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
export async function pgListItemReceipts(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncItemReceiptsInput): Promise<OfflineSyncPage<SyncItemReceiptRecord>> {
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
      ...splitStynxContext(row.context_json), receivedAt: iso(row.received_at) }));
}

/** Tenant queue items (E6 and CTG9), newest `received_at` first, tie-broken by queue item id (C collation). */
export async function pgListQueueItems(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncQueueItemsInput): Promise<OfflineSyncPage<SyncQueueItemRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page<Sorted & { id: string; tenant_id: string; device_batch_id: string; org_unit_id: string; agent_id: string; device_id: string; entity_type: string; local_entity_id: string; idempotency_key: string; payload_hash: string; payload_json: Record<string, unknown>; created_locally_at: Date; reserved_number: string | null; status: SyncQueueItemRecord['status']; received_at: Date; stynx: Record<string, unknown> | null }, SyncQueueItemRecord>(database,
    `select q.id,q.tenant_id,q.device_batch_id,q.org_unit_id,q.agent_id,q.device_id,q.entity_type,q.local_entity_id,q.idempotency_key,q.payload_hash,
            q.payload_json,q.created_locally_at,q.reserved_number,q.status,q.received_at,${pgSortInstant('q.received_at')} as sort_at,r.context_json->'stynx' as stynx
       from offline.sync_queue_items q
       left join offline.sync_item_receipts r on r.tenant_id=q.tenant_id and r.idempotency_key=q.idempotency_key
      where q.tenant_id=$1::uuid and ($2::text is null or q.device_id=$2) and ($3::text is null or q.status=$3) and ($4::text is null or q.entity_type=$4)
        and ($5::timestamptz is null or (q.received_at,q.id collate "C") < ($5::timestamptz,$6::text collate "C"))
      order by q.received_at desc,q.id collate "C" desc limit $7`,
    [scope.tenantId, input.deviceId ?? null, input.status ?? null, input.entityType ?? null, after?.[0] ?? null, after?.[1] ?? null], input.limit,
    row => [row.id],
    row => ({ queueItemId: row.id, tenantId: row.tenant_id, deviceBatchId: row.device_batch_id, orgUnitId: row.org_unit_id, agentId: row.agent_id,
      deviceId: row.device_id, entityType: row.entity_type, localEntityId: row.local_entity_id, idempotencyKey: row.idempotency_key,
      payloadHash: row.payload_hash, payloadJson: row.payload_json, createdLocallyAt: iso(row.created_locally_at),
      ...(row.reserved_number === null ? {} : { reservedNumber: Number(row.reserved_number) }), status: row.status, receivedAt: iso(row.received_at),
      ...platformOf(row.stynx) }));
}

/** Tenant conflicts, newest `created_at` first, tie-broken by conflict id; the device comes from the referenced queue item. */
export async function pgListConflicts(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncConflictsInput): Promise<OfflineSyncPage<SyncConflictRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page<Sorted & { id: string; tenant_id: string; sync_queue_item_id: string; local_entity_id: string; payload_hash: string; conflict_type: string; description: string; status: SyncConflictRecord['status']; resolution: OfflineSyncConflictResolutionStrategy | null; resolved_by: string | null; resolved_at: Date | null; created_at: Date; device_id: string; stynx: Record<string, unknown> | null }, SyncConflictRecord>(database,
    `select c.id,c.tenant_id,c.sync_queue_item_id,c.local_entity_id,c.payload_hash,c.conflict_type,c.description,c.status,c.resolution,c.resolved_by,c.resolved_at,c.created_at,
            q.device_id,${pgSortInstant('c.created_at')} as sort_at,e.evidence->'stynx' as stynx
       from offline.sync_conflicts c
       join offline.sync_queue_items q on q.tenant_id=c.tenant_id and q.id=c.sync_queue_item_id
       left join offline.sync_conflict_evidence e on e.tenant_id=c.tenant_id and e.conflict_id=c.id and e.queue_item_id=c.sync_queue_item_id
      where c.tenant_id=$1::uuid and ($2::text is null or c.status=$2) and ($3::text is null or c.conflict_type=$3) and ($4::text is null or c.sync_queue_item_id=$4)
        and ($5::text is null or q.device_id=$5)
        and ($6::timestamptz is null or (c.created_at,c.id::text collate "C") < ($6::timestamptz,$7::text collate "C"))
      order by c.created_at desc,c.id::text collate "C" desc limit $8`,
    [scope.tenantId, input.status ?? null, input.conflictType ?? null, input.queueItemId ?? null, input.deviceId ?? null, after?.[0] ?? null, after?.[1] ?? null], input.limit,
    row => [row.id],
    row => ({ conflictId: row.id, tenantId: row.tenant_id, queueItemId: row.sync_queue_item_id, localEntityId: row.local_entity_id,
      payloadHash: row.payload_hash, conflictType: row.conflict_type, description: row.description, status: row.status,
      ...(row.resolution === null ? {} : { resolution: row.resolution }), ...(row.resolved_by === null ? {} : { resolvedBy: row.resolved_by }),
      ...(row.resolved_at === null ? {} : { resolvedAt: iso(row.resolved_at) }), deviceId: row.device_id, createdAt: iso(row.created_at), ...platformOf(row.stynx) }));
}

/** Action history of one conflict (ADR-MOBILE-OFFLINE-0003 D2.6), newest `created_at` first, tie-broken by action id. */
export async function pgListConflictActions(database: Database, scope: TrustedOfflineSyncScope, input: ListSyncConflictActionsInput): Promise<OfflineSyncPage<SyncConflictActionRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page<Sorted & { id: string; tenant_id: string; conflict_id: string; action: OfflineSyncConflictResolutionStrategy; reason: string | null; user_ref: string | null; actor_id: string; resulting_status: SyncConflictActionRecord['resultingStatus']; created_at: Date }, SyncConflictActionRecord>(database,
    `select id,tenant_id,conflict_id,action,reason,user_ref,actor_id,resulting_status,created_at,${pgSortInstant('created_at')} as sort_at
       from offline.sync_conflict_actions
      where tenant_id=$1::uuid and conflict_id=$2::uuid
        and ($3::timestamptz is null or (created_at,id::text collate "C") < ($3::timestamptz,$4::text collate "C"))
      order by created_at desc,id::text collate "C" desc limit $5`,
    [scope.tenantId, input.conflictId, after?.[0] ?? null, after?.[1] ?? null], input.limit,
    row => [row.id],
    row => ({ actionId: row.id, tenantId: row.tenant_id, conflictId: row.conflict_id, action: row.action,
      ...(row.reason === null ? {} : { reason: row.reason }), ...(row.user_ref === null ? {} : { userRef: row.user_ref }),
      actorId: row.actor_id, resultingStatus: row.resulting_status, createdAt: iso(row.created_at) }));
}
