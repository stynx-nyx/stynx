import { randomUUID } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { maxLength } from 'class-validator';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { Transaction } from '@stynx-nyx/data';
import {
  canonicalOfflineSyncPayload,
  OfflineSyncError,
  canonicalOfflineSyncPayloadHash,
  type CTG9SyncBatchItemInput,
  type OfflineSyncEvent,
  type OfflineSyncEventPort,
  type OfflineSyncItemApplier,
  type OfflineSyncItemContext,
  type OfflineSyncHookContext,
  type OfflineSyncPayloadHashPort,
} from '@stynx-nyx/offline-sync';
import * as queries from './offline-bookmark.repository.js';

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
  canonicalValue: Record<string, unknown>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBookmarkPayload(value: unknown): value is BookmarkPayload & Record<string, unknown> {
  return isRecord(value) &&
    Object.keys(value).every((key) => ['operation', 'url', 'title', 'notes'].includes(key)) &&
    value.operation === 'create' &&
    typeof value.url === 'string' && value.url.length >= 1 && maxLength(value.url, 2048) &&
    (value.title === undefined || value.title === null ||
      (typeof value.title === 'string' && maxLength(value.title, 256))) &&
    (value.notes === undefined || value.notes === null || typeof value.notes === 'string');
}

function canonicalEventPayload(value: unknown): string {
  if (!isRecord(value))
    throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'Payload must contain only unambiguous JSON values.');
  return canonicalOfflineSyncPayload(value);
}

function payload(item: CTG9SyncBatchItemInput): { value: BookmarkPayload & Record<string, unknown>; canonical: string } {
  if (item.entityType !== 'demo.bookmark')
    reject(
      'OFFLINE_SYNC_BOOKMARK_ENTITY_UNSUPPORTED',
      'This application mapping supports demo.bookmark only.',
    );
  const canonical = canonicalOfflineSyncPayload(item.payloadJson);
  const value: unknown = JSON.parse(canonical);
  if (!isBookmarkPayload(value))
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
  return { value, canonical };
}

async function transactionIdentity(
  trx: OfflineSyncHookContext,
  context: OfflineSyncItemContext,
): Promise<{ trx: Transaction; transactionId: string }> {
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
  const live = await trx.run(queries.bookmarkTransactionIdentityQuery, []);
  if (
    live.sql_role !== 'stynx_app' ||
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
  return { trx, transactionId: live.transaction_id };
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
  const applications = new WeakMap<OfflineSyncHookContext, Map<string, AppliedBookmark>>();
  const append = async (trx: OfflineSyncHookContext, event: OfflineSyncEvent): Promise<void> => {
    const rows = applications.get(trx);
    const applied = rows?.get(event.entityId);
    if (
      !rows ||
      !applied ||
      event.entity !== 'demo.bookmark' ||
      canonicalEventPayload(event.payload) !==
        applied.canonicalPayload
    ) {
      reject(
        'OFFLINE_SYNC_BOOKMARK_EVENT_MISMATCH',
        'The event must belong to the bookmark application in this exact transaction.',
      );
    }
    const { trx: transaction, transactionId } = await transactionIdentity(trx, applied.context);
    if (transactionId !== applied.transactionId) {
      reject(
        'OFFLINE_SYNC_BOOKMARK_EVENT_MISMATCH',
        'The event must belong to the bookmark application in this exact transaction.',
      );
    }
    const receipt = await transaction.run(queries.bookmarkReceiptAttemptsQuery, [applied.context.tenantId, applied.context.receiptId]);
    const attempts = receipt?.attempts;
    if (
      attempts === undefined || attempts === null ||
      !Number.isSafeInteger(attempts) ||
      attempts < 1 ||
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
    await new AuditSqlSink(transaction, { mode: 'audit_write_function' }).writeInTransaction(
      {
        occurredAt: context.now,
        action: 'offline-sync.bookmark.create',
        entity: 'demo.demo__bookmark_bookmark',
        entityId: applied.serverEntityId,
        tenantId: context.tenantId,
        actorId: context.actorId,
        newData: structuredClone(applied.canonicalValue),
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
      transaction,
    );
    rows.delete(event.entityId);
    if (!rows.size) applications.delete(trx);
  };
  return {
    payloadHashPort: {
      hash: async (item) => canonicalOfflineSyncPayloadHash(item.payloadJson),
    },
    itemApplier: {
      async apply(trx, item, context) {
        const decoded = payload(item);
        const { trx: transaction, transactionId } = await transactionIdentity(trx, context);
        const serverEntityId = randomUUID();
        try {
          const inserted = await transaction.run(queries.insertOfflineBookmarkQuery,
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
          if (!inserted || inserted.id !== serverEntityId)
            reject(
              'OFFLINE_SYNC_BOOKMARK_EFFECT_MISSING',
              'The canonical bookmark application did not return its actual row.',
            );
        } catch (error) {
          if (isRecord(error) && error.code === '23505')
            throw new OfflineBookmarkApplicationError(
              'OFFLINE_SYNC_BOOKMARK_URL_CONFLICT',
              409,
              'An active bookmark already uses this URL in the tenant.',
            );
          throw error;
        }
        const receiptId = context.receiptId;
        if (!receiptId)
          reject('OFFLINE_SYNC_BOOKMARK_CONTEXT_REQUIRED', 'A real strict item transaction and effective application context are required.');
        const retainedContext = { ...structuredClone(context), receiptId };
        const rows = applications.get(trx) ?? new Map<string, AppliedBookmark>();
        rows.set(serverEntityId, {
          serverEntityId,
          localEntityId: item.localEntityId,
          canonicalPayload: decoded.canonical,
          canonicalValue: decoded.value,
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
