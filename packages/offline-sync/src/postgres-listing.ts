import { listBatches, listItemReceipts, listQueueItems, listConflicts, listConflictActions } from './listing.repository.js';
import type { Database } from '@stynx-nyx/data';
import { OfflineSyncUpgradeRequiredError } from './errors.js';
import { decodeCursor, listDefaultLimit } from './listing.js';
import { splitStynxContext } from './stynx-context.js';
import type {
  ListSyncBatchReceiptsInput,
  ListSyncConflictActionsInput,
  ListSyncConflictsInput,
  ListSyncItemReceiptsInput,
  ListSyncQueueItemsInput,
  OfflineSyncPage,
  OfflineSyncStynxContext,
  SyncBatchReceiptSummary,
  SyncConflictActionRecord,
  SyncConflictRecord,
  SyncItemReceiptRecord,
  SyncQueueItemRecord,
  TrustedOfflineSyncScope,
} from './types.js';

type Sorted = { sort_at: string | null };
const iso = (value: Date | string | number): string => new Date(value).toISOString();
/** D3.5: the platform object stored under the reserved key, exposed as the typed `stynx` property. */
const platformOf = (stored: Record<string, unknown> | null): { stynx?: OfflineSyncStynxContext } =>
  splitStynxContext(stored === null ? null : { stynx: stored });

async function page<R extends Sorted, T>(
  load: (limit: number) => Promise<readonly R[]>,
  limit: number | undefined,
  key: (row: R) => string[],
  map: (row: R) => T,
): Promise<OfflineSyncPage<T>> {
  const size = limit ?? listDefaultLimit;
  try {
    const rows = await load(size + 1);
    // PostgreSQL to_char can return null for an infinite timestamp. Keep the
    // original mapping/error behavior before serializing the opaque cursor key.
    const mapped = rows.map((row) => ({ key: [row.sort_at, ...key(row)], value: map(row) }));
    const items = mapped.slice(0, size);
    return {
      items: items.map((row) => row.value),
      nextCursor: mapped.length > size
        ? Buffer.from(JSON.stringify(items[items.length - 1]!.key)).toString('base64url')
        : null,
    };
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === '42703' || code === '42P01') throw new OfflineSyncUpgradeRequiredError();
    throw error;
  }
}

/** Tenant batch receipts, newest `created_at` first, tie-broken by device and batch id (C collation). */
export async function pgListBatches(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: ListSyncBatchReceiptsInput,
): Promise<OfflineSyncPage<SyncBatchReceiptSummary>> {
  const after = decodeCursor(input.cursor, 3);
  return page(
    (size) => database.tx((trx) => trx.run(listBatches, [
      scope.tenantId,
      input.deviceId ?? null,
      input.status ?? null,
      after?.[0] ?? null,
      after?.[1] ?? null,
      after?.[2] ?? null, size])),
    input.limit,
    (row) => [row.device_id, row.device_batch_id],
    (row) => ({
      deviceId: row.device_id,
      deviceBatchId: row.device_batch_id,
      batchSequence: row.batch_sequence === null ? null : Number(row.batch_sequence),
      status: row.status,
      responseStatus: row.response_status,
      createdAt: iso(row.created_at),
    }),
  );
}

/** Tenant item receipts, newest `received_at` first, tie-broken by receipt id (C collation). */
export async function pgListItemReceipts(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: ListSyncItemReceiptsInput,
): Promise<OfflineSyncPage<SyncItemReceiptRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page(
    (size) => database.tx((trx) => trx.run(listItemReceipts, [
      scope.tenantId,
      input.deviceId ?? null,
      input.deviceBatchId ?? null,
      input.status ?? null,
      after?.[0] ?? null,
      after?.[1] ?? null, size])),
    input.limit,
    (row) => [row.idempotency_key],
    (row) => ({
      receiptId: row.idempotency_key,
      queueItemId: row.queue_item_id,
      deviceId: row.device_id,
      deviceBatchId: row.device_batch_id,
      payloadHash: row.payload_hash,
      status: row.status,
      ...(row.error_code ? { errorCode: row.error_code } : {}),
      ...splitStynxContext(row.context_json),
      receivedAt: iso(row.received_at),
    }),
  );
}

/** Tenant queue items (E6 and CTG9), newest `received_at` first, tie-broken by queue item id (C collation). */
export async function pgListQueueItems(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: ListSyncQueueItemsInput,
): Promise<OfflineSyncPage<SyncQueueItemRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page(
    (size) => database.tx((trx) => trx.run(listQueueItems, [
      scope.tenantId,
      input.deviceId ?? null,
      input.status ?? null,
      input.entityType ?? null,
      after?.[0] ?? null,
      after?.[1] ?? null, size])),
    input.limit,
    (row) => [row.id],
    (row) => ({
      queueItemId: row.id,
      tenantId: row.tenant_id,
      deviceBatchId: row.device_batch_id,
      orgUnitId: row.org_unit_id,
      agentId: row.agent_id,
      deviceId: row.device_id,
      entityType: row.entity_type,
      localEntityId: row.local_entity_id,
      idempotencyKey: row.idempotency_key,
      payloadHash: row.payload_hash,
      payloadJson: row.payload_json,
      createdLocallyAt: iso(row.created_locally_at),
      ...(row.reserved_number === null ? {} : { reservedNumber: Number(row.reserved_number) }),
      status: row.status,
      receivedAt: iso(row.received_at),
      ...platformOf(row.stynx),
    }),
  );
}

/** Tenant conflicts, newest `created_at` first, tie-broken by conflict id; the device comes from the referenced queue item. */
export async function pgListConflicts(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: ListSyncConflictsInput,
): Promise<OfflineSyncPage<SyncConflictRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page(
    (size) => database.tx((trx) => trx.run(listConflicts, [
      scope.tenantId,
      input.status ?? null,
      input.conflictType ?? null,
      input.queueItemId ?? null,
      input.deviceId ?? null,
      after?.[0] ?? null,
      after?.[1] ?? null, size])),
    input.limit,
    (row) => [row.id],
    (row) => ({
      conflictId: row.id,
      tenantId: row.tenant_id,
      queueItemId: row.sync_queue_item_id,
      localEntityId: row.local_entity_id,
      payloadHash: row.payload_hash,
      conflictType: row.conflict_type,
      description: row.description,
      status: row.status,
      ...(row.resolution === null ? {} : { resolution: row.resolution }),
      ...(row.resolved_by === null ? {} : { resolvedBy: row.resolved_by }),
      ...(row.resolved_at === null ? {} : { resolvedAt: iso(row.resolved_at) }),
      deviceId: row.device_id,
      createdAt: iso(row.created_at),
      ...platformOf(row.stynx),
    }),
  );
}

/** Action history of one conflict (ADR-MOBILE-OFFLINE-0003 D2.6), newest `created_at` first, tie-broken by action id. */
export async function pgListConflictActions(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: ListSyncConflictActionsInput,
): Promise<OfflineSyncPage<SyncConflictActionRecord>> {
  const after = decodeCursor(input.cursor, 2);
  return page(
    (size) => database.tx((trx) => trx.run(listConflictActions, [scope.tenantId, input.conflictId, after?.[0] ?? null, after?.[1] ?? null, size])),
    input.limit,
    (row) => [row.id],
    (row) => ({
      actionId: row.id,
      tenantId: row.tenant_id,
      conflictId: row.conflict_id,
      action: row.action,
      ...(row.reason === null ? {} : { reason: row.reason }),
      ...(row.user_ref === null ? {} : { userRef: row.user_ref }),
      actorId: row.actor_id,
      resultingStatus: row.resulting_status,
      createdAt: iso(row.created_at),
    }),
  );
}
