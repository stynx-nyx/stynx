import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { maxLength } from 'class-validator';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { Transaction } from '@stynx-nyx/data';
import {
  canonicalOfflineSyncPayload,
  canonicalOfflineSyncPayloadHash,
  type CTG9SyncBatchItemInput,
  type OfflineSyncEvent,
  type OfflineSyncEventPort,
  type OfflineSyncItemApplier,
  type OfflineSyncItemContext,
  type OfflineSyncPayloadHashPort,
} from '@stynx-nyx/offline-sync';

interface BookmarkPayload {
  operation: 'create';
  url: string;
  title?: string | null;
  notes?: string | null;
}
interface AppliedBookmark {
  serverEntityId: string;
  localEntityId: string;
  canonicalPayload: string;
  context: OfflineSyncItemContext & { receiptId: string };
  transactionId: string;
}

function reject(code: string, message: string): never {
  throw new OfflineBookmarkApplicationError(code, 422, message);
}

class OfflineBookmarkApplicationError extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    message: string,
  ) {
    super({ statusCode: status, errorCode: code, message, retryable: false }, status);
  }
}

function payload(item: CTG9SyncBatchItemInput): { value: BookmarkPayload; canonical: string } {
  if (item.entityType !== 'demo.bookmark')
    reject(
      'OFFLINE_SYNC_BOOKMARK_ENTITY_UNSUPPORTED',
      'This application mapping supports demo.bookmark only.',
    );
  const canonical = canonicalOfflineSyncPayload(item.payloadJson);
  const value = JSON.parse(canonical) as Record<string, unknown>;
  if (
    Object.keys(value).some((key) => !['operation', 'url', 'title', 'notes'].includes(key)) ||
    value.operation !== 'create' ||
    typeof value.url !== 'string' ||
    value.url.length < 1 ||
    !maxLength(value.url, 2048) ||
    (value.title !== undefined &&
      value.title !== null &&
      (typeof value.title !== 'string' || !maxLength(value.title, 256))) ||
    (value.notes !== undefined && value.notes !== null && typeof value.notes !== 'string')
  )
    reject(
      'OFFLINE_SYNC_BOOKMARK_PAYLOAD_UNSUPPORTED',
      'A canonical bookmark create payload is required.',
    );
  let url: URL;
  try {
    url = new URL(value.url);
  } catch {
    reject('OFFLINE_SYNC_BOOKMARK_URL_INVALID', 'A valid HTTP or HTTPS bookmark URL is required.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    reject('OFFLINE_SYNC_BOOKMARK_URL_INVALID', 'A valid HTTP or HTTPS bookmark URL is required.');
  return { value: value as unknown as BookmarkPayload, canonical };
}

async function transactionIdentity(
  trx: Transaction,
  context: OfflineSyncItemContext,
): Promise<string> {
  if (
    !(trx instanceof Transaction) ||
    trx.role !== 'app' ||
    !trx.strictItemMode ||
    !context.receiptId ||
    !context.agentId ||
    !context.orgUnitId ||
    !context.deviceId ||
    !context.batchId ||
    !Number.isFinite(Date.parse(context.now))
  ) {
    reject(
      'OFFLINE_SYNC_BOOKMARK_CONTEXT_REQUIRED',
      'A real strict item transaction and effective application context are required.',
    );
  }
  const result = await trx.query<{
    actor: string;
    tenant: string;
    sql_role: string;
    role: string;
    isolation: string;
    readonly: string;
    transaction_id: string;
  }>(`select current_user::text as sql_role,
      current_setting('app.role',true) as role,
      current_setting('app.tenant_id',true) as tenant,
      current_setting('app.actor_id',true) as actor,
      current_setting('transaction_isolation') as isolation,
      current_setting('transaction_read_only') as readonly,
      pg_current_xact_id()::text as transaction_id`);
  const live = result.rows[0];
  if (
    result.rows.length !== 1 ||
    live?.sql_role !== 'stynx_app' ||
    live.role !== 'app' ||
    live.tenant !== context.tenantId ||
    live.actor !== context.actorId ||
    live.isolation !== 'read committed' ||
    live.readonly !== 'off' ||
    !live.transaction_id
  ) {
    reject(
      'OFFLINE_SYNC_BOOKMARK_TRANSACTION_MISMATCH',
      'The supplied transaction must retain its actual tenant and actor.',
    );
  }
  return live.transaction_id;
}

/**
 * One explicit consumer mapping. The canonical payload contains every bookmark
 * field written here. Agent/org/device/receipt/concurrency are effective host
 * context, preserved separately; this port does not invent an agent resolver.
 */
export function createOfflineBookmarkApplicationPorts(): {
  itemApplier: OfflineSyncItemApplier;
  payloadHashPort: OfflineSyncPayloadHashPort;
  eventPort: OfflineSyncEventPort;
} {
  const applications = new WeakMap<Transaction, Map<string, AppliedBookmark>>();
  const append = async (trx: Transaction, event: OfflineSyncEvent): Promise<void> => {
    const rows = applications.get(trx);
    const applied = rows?.get(event.entityId);
    if (
      !applied ||
      event.entity !== 'demo.bookmark' ||
      canonicalOfflineSyncPayload(event.payload as Record<string, unknown>) !==
        applied.canonicalPayload ||
      (await transactionIdentity(trx, applied.context)) !== applied.transactionId
    ) {
      reject(
        'OFFLINE_SYNC_BOOKMARK_EVENT_MISMATCH',
        'The event must belong to the bookmark application in this exact transaction.',
      );
    }
    const receipt = await trx.query<{ attempts: number }>(
      `select (context_json->'stynx'->>'attempts')::integer as attempts
       from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2`,
      [applied.context.tenantId, applied.context.receiptId],
    );
    const attempts = receipt.rows[0]?.attempts;
    if (
      receipt.rows.length !== 1 ||
      !Number.isSafeInteger(attempts) ||
      attempts! < 1 ||
      ![applied.context.receiptId, `${applied.context.receiptId}:retry:${attempts}`].includes(
        event.idempotencyKey,
      )
    ) {
      reject(
        'OFFLINE_SYNC_BOOKMARK_RECEIPT_MISMATCH',
        'The application event must retain its actual receipt and attempt key.',
      );
    }
    const context = applied.context;
    await new AuditSqlSink(trx, { mode: 'audit_write_function' }).writeInTransaction(
      {
        occurredAt: context.now,
        action: 'offline-sync.bookmark.create',
        entity: 'demo.demo__bookmark_bookmark',
        entityId: applied.serverEntityId,
        tenantId: context.tenantId,
        actorId: context.actorId,
        newData: JSON.parse(applied.canonicalPayload) as Record<string, unknown>,
        metadata: {
          offlineReceiptId: context.receiptId,
          offlineEventKey: event.idempotencyKey,
          localEntityId: applied.localEntityId,
          agentId: context.agentId,
          orgUnitId: context.orgUnitId,
          deviceId: context.deviceId,
          batchId: context.batchId,
          applicationTime: context.now,
          ...(context.concurrencySuspected === undefined
            ? {}
            : { concurrencySuspected: context.concurrencySuspected }),
          ...(context.concurrentPairs === undefined
            ? {}
            : { concurrentPairs: context.concurrentPairs }),
        },
      },
      trx,
    );
    rows!.delete(event.entityId);
    if (!rows!.size) applications.delete(trx);
  };
  return {
    payloadHashPort: {
      hash: async (item) => canonicalOfflineSyncPayloadHash(item.payloadJson),
    },
    itemApplier: {
      async apply(trx, item, context) {
        const decoded = payload(item);
        const transactionId = await transactionIdentity(trx, context);
        const serverEntityId = randomUUID();
        try {
          const inserted = await trx.query<{ id: string }>(
            `insert into demo.demo__bookmark_bookmark
             (id,tenant_id,owner_id,url,title,notes,created_at,updated_at)
             values($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::timestamptz,$7::timestamptz)
             returning id::text`,
            [
              serverEntityId,
              context.tenantId,
              context.actorId,
              decoded.value.url,
              decoded.value.title ?? null,
              decoded.value.notes ?? null,
              context.now,
            ],
          );
          if (inserted.rows.length !== 1 || inserted.rows[0]!.id !== serverEntityId)
            reject(
              'OFFLINE_SYNC_BOOKMARK_EFFECT_MISSING',
              'The canonical bookmark application did not return its actual row.',
            );
        } catch (error) {
          if ((error as { code?: string }).code === '23505')
            throw new OfflineBookmarkApplicationError(
              'OFFLINE_SYNC_BOOKMARK_URL_CONFLICT',
              409,
              'An active bookmark already uses this URL in the tenant.',
            );
          throw error;
        }
        const retainedContext = structuredClone(context) as OfflineSyncItemContext & {
          receiptId: string;
        };
        const rows = applications.get(trx) ?? new Map<string, AppliedBookmark>();
        rows.set(serverEntityId, {
          serverEntityId,
          localEntityId: item.localEntityId,
          canonicalPayload: decoded.canonical,
          context: retainedContext,
          transactionId,
        });
        applications.set(trx, rows);
        return {
          serverEntityId,
          consumerAttributes: {
            localEntityId: item.localEntityId,
            receiptId: context.receiptId,
            agentId: context.agentId,
            orgUnitId: context.orgUnitId,
            deviceId: context.deviceId,
            ...(context.concurrencySuspected === undefined
              ? {}
              : { concurrencySuspected: context.concurrencySuspected }),
            ...(context.concurrentPairs === undefined
              ? {}
              : { concurrentPairs: context.concurrentPairs }),
          },
        };
      },
    },
    eventPort: {
      appendInTransaction: append,
      async appendManyInTransaction(trx, events) {
        for (const event of events) await append(trx, event);
      },
    },
  };
}
