import { batchLockTimeout, lockBatchIdentity, hydrateExistingLegacyReceipts, takeExistingBatchLease, existingLegacyBatchKeys, insertUnverifiedLegacyBatch, hydrateImportedLegacyReceipts, lockLastBatchSequence, insertDurableBatch, legacyBatchIdentity, retryBatchLockTimeout, takeOpenBatchLease, lockItemIdentity, originalItemIdentity, insertDurableQueueItem, storedItemIdentity, appendQueueReuseAttempt, ensureLegacyBatch, ensureLegacyReceipt, appendLegacyUnappliedAttempt, insertInitialReceipt, lockInitialReceipt, appendDuplicateAttempt, lockApplyingReceipt, queueIdentityExists, recordConcurrencyContext, lockNumberCoverage, lockNumberConsumption, claimNumberConsumption, applyNumberConsumption, applyQueueItem, applyItemReceipt, recordAppliedContext, appendDomainConflict, appendDomainEvidence, recordFailedReceipt, recordOutcomeQueue, appendReapplyAttempt, appendFinalAttempt, finalizeDurableBatch, releaseDurableLease } from './durable.repository.js';
import { readDurableBatch, renewDurableLease, insertTransportKey, boundTransportKey, durableItemReceipts, appendIntegrityAttempt, integrityAttemptContext, existingIntegrityConflict, appendIntegrityConflict, appendIntegrityEvidence, integrityRejectionByIdentity, durableItemByKey, lockDurableReservation, transitionDurableReservation, blockReservationConsumption, expireDurableConsumption, consumptionReservation, consumptionOverrides, appendConcurrencyConflict, appendConcurrencyEvidence, markConcurrencyQueue, markConcurrencyReceipt } from './durable.repository.js';
export { pgReconcile } from './postgres-reconciliation.js';
import { domainErrorContext } from './domain-error-context.js';
import { classifyDomainOutcome, domainFailureCode } from './domain-outcome.js';
import { consumptionReadInstant, projectNumberingConsumption } from './consumption-projection.js';
import { createHash, randomUUID } from 'node:crypto';
import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import { Database, executeTypedQueryResult, executeTypedCommand, IndependentTransactionConnectionError, type Transaction } from '@stynx-nyx/data';
import type {
  CTG9SubmitSyncBatchInput,
  CTG9SubmitSyncBatchResult,
  DurableBatchExecutionOptions,
  SyncBatchReceipt,
  SyncItemReceipt,
  SyncIntegrityRejection,
  SyncIntegrityRejectionIdentity,
  TrustedOfflineSyncScope,
  NumberingConsumptionResult,
  NumberingConsumptionEntry,
  CTG9NumberingReservation,
  CancelNumberingReservationInput,
  SettleNumberingInput,
  CTG9SyncBatchItemInput,
  OfflineSyncStynxContext,
  OfflineSyncItemContext,
  OfflineSyncConcurrentPair,
} from './types.js';
import {
  OfflineSyncConfigurationError,
  OfflineSyncError,
  OfflineSyncNumberingOutcome,
  OfflineSyncUpgradeRequiredError,
} from './errors.js';
import {
  applyReplayResponse,
  batchContextFingerprint,
  captureReplayableHeaders,
  transportCompositeKey,
  transportFingerprint,
} from './transport.js';
import { verifyOfflineSyncPayloadHash } from './payload-integrity.js';
import { prepareOfflineSyncItem } from './pre-apply.js';
import { activeReservationError } from './reservation-admission.js';
import {
  boundedConsumerAttributes,
  recordedAttempts,
  splitStynxContext,
  stynxContextOf,
  executionStynxContext,
} from './stynx-context.js';

interface BatchRow {
  response_body_is_archived?: boolean | undefined;
  initial_queue_status?: 'received' | 'pending' | undefined;
  device_id: string;
  device_batch_id: string;
  batch_sequence: string | number | null;
  status: SyncBatchReceipt['status'];
  context_hash: string;
  declared_keys: (string | null)[];
  lease_token: string | null;
  lease_generation: string | number;
  lease_expires_at: Date | string | number | null;
  response_status: number | null;
  response_body_bytes: Buffer | null;
  response_headers: Record<string, string> | null;
  transport_key: string | null;
  transport_fingerprint: string | null;
  lease_valid?: boolean | null | undefined;
}
interface ReservationRow {
  id: string;
  tenant_id: string;
  range_id: string;
  org_unit_id: string;
  entity_type: string;
  series: string;
  agent_id: string;
  device_id: string;
  shift_id: string | null;
  start_number: string | number;
  end_number: string | number;
  next_number: string | number;
  valid_until: Date | string | number;
  status: CTG9NumberingReservation['status'];
  expired?: boolean | undefined;
}
const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const failure = (
  code: 'OFFLINE_SYNC_BATCH_CONFLICT' | 'OFFLINE_SYNC_BATCH_SEQUENCE',
  status: number,
  message: string,
  context?: Readonly<Record<string, unknown>>,
): never => {
  throw new OfflineSyncError(code, status, message, false, undefined, context);
};
const mapReservation = (r: ReservationRow): CTG9NumberingReservation => ({
  reservationId: r.id,
  rangeId: r.range_id,
  tenantId: r.tenant_id,
  orgUnitId: r.org_unit_id,
  entityType: r.entity_type,
  series: r.series,
  agentId: r.agent_id,
  deviceId: r.device_id,
  shiftId: r.shift_id,
  startNumber: Number(r.start_number),
  endNumber: Number(r.end_number),
  nextNumber: Number(r.next_number),
  validUntil: new Date(r.valid_until).toISOString(),
  status: r.status,
});
function assertIndependent(database: Database): void {
  if (database.hasHeldConnection()) throw new IndependentTransactionConnectionError();
}
function upgrade(error: unknown): never {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const message = typeof error === 'object' && error !== null && 'message' in error ? error.message : undefined;
  if (code === 'STY44') throw activeReservationError();
  if (code === '42703' && typeof message === 'string' && /\binitial_queue_status\b/u.test(message))
    throw new OfflineSyncUpgradeRequiredError('0005');
  if (code === '42703' || code === '42P01') throw new OfflineSyncUpgradeRequiredError();
  throw error;
}
async function txDurable<T>(database: Database, fn: (trx: Transaction) => Promise<T>): Promise<T> {
  try {
    return await database.tx(fn);
  } catch (error) {
    upgrade(error);
  }
}
async function readBatch(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  input: Pick<CTG9SubmitSyncBatchInput, 'deviceId' | 'deviceBatchId'>,
): Promise<BatchRow | null> {
  const rows = await trx.run(readDurableBatch,
    [scope.tenantId, input.deviceId, input.deviceBatchId],
  );
  return rows[0] ?? null;
}
async function renewLease(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  input: CTG9SubmitSyncBatchInput,
  token: string,
  generation: number,
): Promise<void> {
  const held = await executeTypedQueryResult(trx, renewDurableLease,
    [scope.tenantId, input.deviceId, input.deviceBatchId, token, generation],
  );
  if (!held.rowCount) failure('OFFLINE_SYNC_BATCH_CONFLICT', 409, 'Batch lease was fenced.');
}
function rowReceipt(row: BatchRow, items: SyncItemReceipt[]): SyncBatchReceipt {
  return {
    deviceId: row.device_id,
    deviceBatchId: row.device_batch_id,
    batchSequence: row.batch_sequence === null ? null : Number(row.batch_sequence),
    status: row.status,
    items,
    responseStatus: row.response_status,
    responseBodyBytes: row.response_body_bytes,
    responseHeaders: row.response_headers ?? {},
  };
}
function verifyBatchIdentity(
  row: BatchRow,
  input: CTG9SubmitSyncBatchInput,
  contextHash: string,
  compositeKey: string,
  fingerprint: string,
): void {
  if (row.status === 'legacy_closed_unverified') return;
  if (
    row.context_hash !== contextHash ||
    (row.batch_sequence === null ? null : Number(row.batch_sequence)) !==
      (input.batchSequence ?? null) ||
    JSON.stringify(row.declared_keys) !==
      JSON.stringify(input.items.map((item) => item.idempotencyKey ?? null))
  )
    failure('OFFLINE_SYNC_BATCH_CONFLICT', 409, 'Batch context differs.');
  if (
    row.transport_key === compositeKey &&
    row.transport_fingerprint !== null &&
    row.transport_fingerprint !== fingerprint
  )
    throw new UnprocessableEntityException('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
}
async function bindTransportKey(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  input: CTG9SubmitSyncBatchInput,
  compositeKey: string,
  fingerprint: string,
): Promise<void> {
  await trx.run(insertTransportKey,
    [scope.tenantId, compositeKey, input.deviceId, input.deviceBatchId, fingerprint],
  );
  const bound = (
    await trx.run(boundTransportKey,
      [scope.tenantId, compositeKey],
    )
  )[0];
  if (bound?.transport_fingerprint !== fingerprint)
    throw new UnprocessableEntityException('IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY');
  if (bound.device_id !== input.deviceId || bound.device_batch_id !== input.deviceBatchId)
    failure('OFFLINE_SYNC_BATCH_CONFLICT', 409, 'Transport key belongs to another batch.');
}
async function itemReceipts(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  input: Pick<CTG9SubmitSyncBatchInput, 'deviceId' | 'deviceBatchId'>,
): Promise<SyncItemReceipt[]> {
  const rows = await trx.run(durableItemReceipts,
    [scope.tenantId, input.deviceId, input.deviceBatchId],
  );
  return rows.map((r) => ({
    queueItemId: r.queue_item_id,
    status: r.status,
    ...(r.error_code ? { errorCode: r.error_code } : {}),
    ...splitStynxContext(r.context_json),
  }));
}
/**
 * ADR-MOBILE-OFFLINE-0003 D3 item 6: a same-key submission whose hash differs from the stored one records
 * the rejected attempt with both hashes and, when the original has a queue row, one `integrity` conflict
 * per tenant, key and received hash. It runs inside the preflight transaction, which already holds the
 * tenant/key advisory lock, so the select-then-insert cannot race another submission of the same key.
 */
async function integrityRejection(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  input: CTG9SubmitSyncBatchInput,
  item: CTG9SyncBatchItemInput,
  key: string,
  original: {
    id: string;
    payload_hash: string;
    local_entity_id: string;
  } | null,
  options: DurableBatchExecutionOptions,
  now: string,
): Promise<OfflineSyncStynxContext | undefined> {
  const stynx = stynxContextOf({
    receiptId: key,
    errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
    reasonCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
    receivedPayloadHash: item.payloadHash,
    storedPayloadHash: original?.payload_hash,
    relatedQueueItemId: original?.id,
    retryable: false,
  });
  await trx.run(appendIntegrityAttempt,
    [
      scope.tenantId,
      input.deviceId,
      input.deviceBatchId,
      item.queueItemId,
      key,
      item.payloadHash,
      JSON.stringify({ stynx }),
      now,
    ],
  );
  const recorded = (
    await trx.run(integrityAttemptContext,
      [scope.tenantId, input.deviceId, input.deviceBatchId, item.queueItemId],
    )
  )[0];
  const proof = splitStynxContext(recorded?.context_json).stynx;
  if (!original) return proof;
  const existing = await trx.run(existingIntegrityConflict,
    [scope.tenantId, original.id, item.payloadHash],
  );
  if (existing[0]) return proof;
  const conflictId = randomUUID();
  await trx.run(appendIntegrityConflict,
    [conflictId, scope.tenantId, original.id, original.local_entity_id, original.payload_hash, now],
  );
  const context = {
    ...scope,
    agentId: options.agentId,
    orgUnitId: input.orgUnitId,
    deviceId: input.deviceId,
    batchId: input.deviceBatchId,
    now,
    receiptId: key,
  };
  const allowedActions = (await options.ports.conflictResolver?.allowedActions?.(
    trx,
    conflictId,
    context,
  )) ?? ['reject'];
  await trx.run(appendIntegrityEvidence,
    [
      scope.tenantId,
      conflictId,
      original.id,
      item.queueItemId,
      JSON.stringify(allowedActions),
      JSON.stringify({
        receivedPayloadHash: item.payloadHash,
        storedPayloadHash: original.payload_hash,
        detectedAt: now,
        stynx: stynxContextOf({
          receiptId: key,
          reasonCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
          receivedPayloadHash: item.payloadHash,
          storedPayloadHash: original.payload_hash,
          relatedQueueItemId: item.queueItemId,
          retryable: allowedActions.includes('retry_after_correction'),
        }),
      }),
    ],
  );
  return proof;
}
export async function pgGetBatch(
  database: Database,
  scope: TrustedOfflineSyncScope,
  deviceId: string,
  deviceBatchId: string,
): Promise<SyncBatchReceipt | null> {
  return txDurable(database, async (trx) => {
    const input = { deviceId, deviceBatchId };
    const row = await readBatch(trx, scope, input);
    return row ? rowReceipt(row, await itemReceipts(trx, scope, input)) : null;
  });
}
export async function pgGetIntegrityRejection(
  database: Database,
  scope: TrustedOfflineSyncScope,
  identity: SyncIntegrityRejectionIdentity,
): Promise<SyncIntegrityRejection | null> {
  return txDurable(database, async (trx) => {
    const record = (
      await trx.run(integrityRejectionByIdentity,
        [scope.tenantId, identity.deviceId, identity.deviceBatchId, identity.queueItemId],
      )
    )[0];
    if (!record) return null;
    const proof = splitStynxContext(record.context_json).stynx;
    return {
      ...identity,
      tenantId: scope.tenantId,
      idempotencyKey: record.idempotency_key,
      receivedPayloadHash: record.payload_hash,
      ...(proof?.storedPayloadHash === undefined
        ? {}
        : { storedPayloadHash: proof.storedPayloadHash }),
      ...(proof?.relatedQueueItemId === undefined
        ? {}
        : { originalQueueItemId: proof.relatedQueueItemId }),
      rejectedAt: new Date(record.created_at).toISOString(),
      errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
    };
  });
}

export async function pgGetItem(
  database: Database,
  scope: TrustedOfflineSyncScope,
  key: string,
): Promise<SyncItemReceipt | null> {
  return txDurable(database, async (trx) => {
    const r = (
      await trx.run(durableItemByKey,
        [scope.tenantId, key],
      )
    )[0];
    return r
      ? {
          queueItemId: r.queue_item_id,
          status: r.status,
          ...(r.error_code ? { errorCode: r.error_code } : {}),
          ...splitStynxContext(r.context_json),
        }
      : null;
  });
}
export async function pgTransition(
  database: Database,
  scope: TrustedOfflineSyncScope,
  id: string,
  status: CTG9NumberingReservation['status'],
  input: CancelNumberingReservationInput | SettleNumberingInput,
  now: string,
  action: 'block' | 'close' | 'settle',
): Promise<CTG9NumberingReservation> {
  return txDurable(database, async (trx) => {
    const r = (
      await trx.run(lockDurableReservation, [scope.tenantId, id])
    )[0];
    if (!r)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        'Reservation was not found.',
      );
    if (r.status === status && action !== 'settle') return mapReservation(r);
    if (
      !['reserved', 'expired'].includes(r.status) &&
      !(action === 'settle' && r.status === 'consumed')
    )
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_STATE',
        409,
        'Reservation cannot transition.',
      );
    const userRef = action === 'settle' && 'userRef' in input ? input.userRef ?? null : null;
    const updated = (
      await trx.run(transitionDurableReservation,
        [scope.tenantId, id, status, scope.actorId, now, action, input.reason ?? null, userRef],
      )
    )[0]!;
    if (status === 'blocked')
      await trx.run(blockReservationConsumption,
        [scope.tenantId, id],
      );
    if (status === 'consumed')
      await trx.run(expireDurableConsumption,
        [scope.tenantId, id],
      );
    return mapReservation(updated);
  });
}
export async function pgConsumption(
  database: Database,
  scope: TrustedOfflineSyncScope,
  id: string,
  now?: string,
): Promise<NumberingConsumptionResult> {
  const observedAt = consumptionReadInstant(now);
  return txDurable(database, async (trx) => {
    const r = (
      await trx.run(consumptionReservation,
        [scope.tenantId, id],
      )
    )[0];
    if (!r)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        'Reservation was not found.',
      );
    const rows = await trx.run(consumptionOverrides,
      [scope.tenantId, id],
    );
    const overrides = new Map(rows.map((e) => [Number(e.number), e]));
    const consumption: NumberingConsumptionEntry[] = [];
    for (let number = Number(r.start_number); number <= Number(r.end_number); number += 1) {
      const entry = overrides.get(number);
      consumption.push({
        number,
        status: entry?.status ?? 'available',
        serverEntityId: entry?.server_entity_id ?? null,
        // Preserve the established millisecond spelling while retaining nonzero microseconds.
        finalizedAt: entry?.finalized_at?.replace(/0{1,3}Z$/u, 'Z') ?? null,
      });
    }
    return {
      reservationId: id,
      status: r.status,
      consumption: projectNumberingConsumption(
        { status: r.status, validUntil: r.valid_until },
        consumption,
        observedAt,
      ),
    };
  });
}

async function pgRecordConcurrency(
  trx: Transaction,
  scope: TrustedOfflineSyncScope,
  queueItemId: string,
  options: DurableBatchExecutionOptions,
  context: OfflineSyncItemContext,
  pairs: readonly OfflineSyncConcurrentPair[],
  now: string,
): Promise<{ conflict: boolean; marks: Record<string, unknown> }> {
  let concurrencyConflict = false;
  let conflictMarks: Record<string, unknown> = {};
  const affectedPairs = new Map<string, string>();
  const affectedRetryable = new Map<string, boolean>();
  for (const pair of pairs) {
    for (const affected of new Set([pair.firstItemId, pair.secondItemId])) {
      const conflictId = randomUUID();
      await trx.run(appendConcurrencyConflict,
        [scope.tenantId, affected, conflictId, now],
      );
      const allowedActions = (await options.ports.conflictResolver?.allowedActions?.(
        trx,
        conflictId,
        context,
      )) ?? ['manual-review'];
      const relatedQueueItemId =
        affected === pair.firstItemId ? pair.secondItemId : pair.firstItemId;
      const conflictStynx = stynxContextOf({
        reasonCode: 'OFFLINE_SYNC_CONCURRENCY_SUSPECTED',
        concurrencySuspected: true,
        concurrentPairs: [pair],
        relatedQueueItemId,
        retryable: allowedActions.includes('retry_after_correction'),
      });
      affectedPairs.set(affected, relatedQueueItemId);
      affectedRetryable.set(affected, allowedActions.includes('retry_after_correction'));
      await trx.run(appendConcurrencyEvidence,
        [
          scope.tenantId,
          conflictId,
          affected,
          relatedQueueItemId,
          JSON.stringify(allowedActions),
          JSON.stringify({
            pair,
            detectedAt: now,
            concurrencyWindowMinutes: options.policy.concurrencyWindowMinutes,
            stynx: conflictStynx,
          }),
        ],
      );
      await trx.run(markConcurrencyQueue,
        [scope.tenantId, affected, now],
      );
      await trx.run(markConcurrencyReceipt,
        [
          scope.tenantId,
          affected,
          JSON.stringify({ conflictId, relatedQueueItemId, allowedActions }),
          now,
          JSON.stringify(conflictStynx),
        ],
      );
    }
    if ([pair.firstItemId, pair.secondItemId].includes(queueItemId)) {
      concurrencyConflict = true;
      conflictMarks = {
        reasonCode: 'OFFLINE_SYNC_CONCURRENCY_SUSPECTED',
        relatedQueueItemId: affectedPairs.get(queueItemId),
        retryable: affectedRetryable.get(queueItemId),
      };
    }
  }
  return { conflict: concurrencyConflict, marks: conflictMarks };
}

function replayClosedBatch(
  row: BatchRow,
  options: DurableBatchExecutionOptions,
): CTG9SubmitSyncBatchResult {
  if (row.response_body_is_archived && typeof options.transport.replayArchivedBody !== 'function')
    throw new OfflineSyncConfigurationError('archivedReplayTransport');
  applyReplayResponse(
    options.transport,
    options.ports,
    row.response_status ?? 201,
    row.response_headers,
  );
  const bytes = Buffer.from(row.response_body_bytes ?? '');
  if (row.response_body_is_archived)
    options.transport.replayArchivedBody!(
      Buffer.from(bytes),
      Object.freeze({ ...row.response_headers }),
    );
  // Programmatic return is decoded separately; the archived wire bytes are never reserialized.
  return JSON.parse(bytes.toString('utf8')) as CTG9SubmitSyncBatchResult;
}

export async function pgSubmit(
  database: Database,
  scope: TrustedOfflineSyncScope,
  input: CTG9SubmitSyncBatchInput,
  options: DurableBatchExecutionOptions,
  now: string,
): Promise<CTG9SubmitSyncBatchResult> {
  assertIndependent(database);
  const itemKeys = new Map<string, string>();
  const declaredKeys = new Set<string>();
  for (const item of input.items) {
    if (item.reservedNumber !== undefined && !Number.isSafeInteger(item.reservedNumber))
      throw new OfflineSyncError(
        'OFFLINE_SYNC_INVALID_INPUT',
        400,
        'reservedNumber must be a safe integer.',
      );
    if (item.idempotencyKey?.startsWith('stynx:legacy:'))
      throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'Reserved item namespace.');
    let key = item.idempotencyKey;
    if (!key) {
      const identity = options.ports.legacyItemIdentityResolver
        ? await options.ports.legacyItemIdentityResolver.resolve({
            tenantId: scope.tenantId,
            deviceId: input.deviceId,
            deviceBatchId: input.deviceBatchId,
            queueItemId: item.queueItemId,
            localEntityId: item.localEntityId,
            entityType: item.entityType,
          })
        : [input.deviceId, input.deviceBatchId, item.queueItemId].join('\0');
      if (!identity)
        throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, 'Legacy identity is empty.');
      key = `stynx:legacy:v1:${sha(`${scope.tenantId}\0${identity}`)}`;
    }
    if (declaredKeys.has(key))
      throw new OfflineSyncError(
        'OFFLINE_SYNC_INVALID_INPUT',
        400,
        'Item identity appears more than once in the batch.',
      );
    declaredKeys.add(key);
    itemKeys.set(item.queueItemId, key);
  }
  if (
    !options.ports.itemApplier &&
    input.items.some((item) => item.idempotencyKey && item.reservedNumber !== undefined)
  )
    throw new OfflineSyncConfigurationError('itemApplier');
  if (options.ports.itemApplier && !options.ports.eventPort)
    throw new OfflineSyncConfigurationError('eventPort');
  const contextHash = batchContextFingerprint(input, options.agentId);
  const fingerprint = transportFingerprint(options.transport, input);
  const compositeKey = transportCompositeKey(scope, options.transport);
  const token = randomUUID();
  let acquired = false;
  let row: BatchRow;
  try {
    row = await txDurable(database, async (trx) => {
      await trx.run(batchLockTimeout, []);
      await trx.run(lockBatchIdentity, [
        `${scope.tenantId}:${input.deviceId}`,
      ]);
      const existing = await readBatch(trx, scope, input);
      if (existing) {
        verifyBatchIdentity(existing, input, contextHash, compositeKey, fingerprint);
        if (existing.status !== 'legacy_closed_unverified')
          await bindTransportKey(trx, scope, input, compositeKey, fingerprint);
        if (existing.status === 'legacy_closed_unverified')
          await trx.run(hydrateExistingLegacyReceipts,
            [scope.tenantId, input.deviceId, input.deviceBatchId],
          );
        if (existing.status === 'closed' || existing.status === 'legacy_closed_unverified')
          return existing;
        if (existing.lease_token && existing.lease_valid) return existing;
        const taken = (
          await trx.run(takeExistingBatchLease,
            [scope.tenantId, input.deviceId, input.deviceBatchId, token],
          )
        )[0];
        if (!taken) return existing;
        acquired = true;
        return taken;
      }
      const e6Items = await trx.run(existingLegacyBatchKeys,
        [scope.tenantId, input.deviceId, input.deviceBatchId],
      );
      if (e6Items.length) {
        const legacy = (
          await trx.run(insertUnverifiedLegacyBatch,
            [
              scope.tenantId,
              input.deviceId,
              input.deviceBatchId,
              input.orgUnitId,
              options.agentId,
              JSON.stringify(e6Items.map((r) => r.idempotency_key)),
            ],
          )
        )[0]!;
        await trx.run(hydrateImportedLegacyReceipts,
          [scope.tenantId, input.deviceId, input.deviceBatchId],
        );
        return legacy;
      }
      if (input.batchSequence != null) {
        const sequences = await trx.run(lockLastBatchSequence,
          [scope.tenantId, input.deviceId],
        );
        const expected = Number(sequences[0]?.batch_sequence ?? 0) + 1;
        if (input.batchSequence < expected)
          failure('OFFLINE_SYNC_BATCH_CONFLICT', 409, 'Batch sequence already used.', {
            expectedSequence: expected,
            receivedSequence: input.batchSequence,
            deviceBatchId: input.deviceBatchId,
          });
        if (input.batchSequence > expected)
          failure(
            'OFFLINE_SYNC_BATCH_SEQUENCE',
            422,
            `Expected batch sequence ${expected}; received ${input.batchSequence}.`,
            {
              expectedSequence: expected,
              receivedSequence: input.batchSequence,
              deviceBatchId: input.deviceBatchId,
            },
          );
      }
      const inserted = (
        await trx.run(insertDurableBatch,
          [
            scope.tenantId,
            input.deviceId,
            input.deviceBatchId,
            input.orgUnitId,
            options.agentId,
            input.batchSequence ?? null,
            contextHash,
            JSON.stringify(input.items.map((i) => i.idempotencyKey ?? null)),
            token,
            compositeKey,
            fingerprint,
            options.ports.initialQueueStatus ?? 'received',
          ],
        )
      )[0]!;
      await bindTransportKey(trx, scope, input, compositeKey, fingerprint);
      acquired = true;
      return inserted;
    });
  } catch (error) {
    if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03')) upgrade(error);
    const contestedRow = await txDurable(database, async (trx) => {
      const contested = await readBatch(trx, scope, input);
      if (!contested) return null;
      verifyBatchIdentity(contested, input, contextHash, compositeKey, fingerprint);
      if (contested.status !== 'legacy_closed_unverified')
        await bindTransportKey(trx, scope, input, compositeKey, fingerprint);
      return contested;
    });
    if (!contestedRow)
      throw new OfflineSyncError(
        'OFFLINE_SYNC:BATCH:in-progress',
        503,
        'Batch is in progress.',
        true,
      );
    row = contestedRow;
  }
  if (row.status === 'legacy_closed_unverified') {
    const legacyItems = await txDurable(
      database,
      async (trx) =>
        (
          await trx.run(legacyBatchIdentity,
            [scope.tenantId, input.deviceId, input.deviceBatchId],
          )
        ),
    );
    const declared = [...input.items]
      .map((item) => ({
        id: item.queueItemId,
        entity_type: item.entityType,
        local_entity_id: item.localEntityId,
        idempotency_key: item.idempotencyKey ?? '',
        payload_hash: item.payloadHash,
      }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (JSON.stringify(legacyItems) !== JSON.stringify(declared))
      failure('OFFLINE_SYNC_BATCH_CONFLICT', 409, 'Legacy batch context differs.');
    const legacy = options.ports.legacyIdempotencyStore;
    if (!legacy)
      throw new OfflineSyncError(
        'OFFLINE_SYNC_BATCH_CONFLICT',
        409,
        'Legacy batch ACK cannot be verified.',
      );
    const routeKey = `${options.transport.method}:${options.transport.path}`;
    const transportUserId =
      options.transport.transportUserId === undefined
        ? scope.actorId
        : options.transport.transportUserId;
    const decision = {
      request: {
        method: options.transport.method,
        url: options.transport.path,
        body: options.transport.requestBody ?? input,
        headers: {},
      },
      compositeKey,
      headerName: 'Idempotency-Key',
      headerValue: options.transport.transportIdempotencyKey,
      requestFingerprint: fingerprint,
      tenantId: scope.tenantId,
      ...(transportUserId === null ? {} : { userId: transportUserId }),
      routeKey,
      ttlMs: 86_400_000,
    };
    const entry = await legacy.lookup(decision);
    if (
      !entry ||
      entry.status !== 'completed' ||
      entry.requestFingerprint !== fingerprint ||
      entry.expiresAt <= Date.now() ||
      entry.body === undefined ||
      entry.statusCode === null
    )
      throw new OfflineSyncError(
        'OFFLINE_SYNC_BATCH_CONFLICT',
        409,
        'Legacy batch ACK cannot be verified.',
      );
    applyReplayResponse(options.transport, options.ports, entry.statusCode, entry.headers);
    return entry.body as CTG9SubmitSyncBatchResult;
  }
  if (row.status === 'closed') return replayClosedBatch(row, options);
  if (!acquired) {
    const deadline = Date.now() + (options.ports.leaseWaitMs ?? 750);
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const current = await txDurable(database, (trx) => readBatch(trx, scope, input));
      if (current?.status === 'closed' && current.response_body_bytes)
        return replayClosedBatch(current, options);
      const taken = await txDurable(database, async (trx) => {
        await trx.run(retryBatchLockTimeout, []);
        return (
          (
            await trx.run(takeOpenBatchLease,
              [scope.tenantId, input.deviceId, input.deviceBatchId, token],
            )
          )[0] ?? null
        );
      }).catch((error) => {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03') return null;
        throw error;
      });
      if (taken) {
        row = taken;
        acquired = true;
        break;
      }
    }
    if (!acquired)
      throw new OfflineSyncError(
        'OFFLINE_SYNC:BATCH:in-progress',
        503,
        'Batch is in progress.',
        true,
      );
  }
  const generation = Number(row.lease_generation);
  try {
    const results: CTG9SubmitSyncBatchResult['items'][number][] = [];
    const receipts: SyncItemReceipt[] = [];
    let duplicates = 0;
    let retryable = false;
    for (const item of input.items) {
      const key = itemKeys.get(item.queueItemId)!;
      const initialStatus =
        item.idempotencyKey && row.initial_queue_status === 'pending' ? 'pending' : 'received';
      const preflight = await txDurable(database, async (trx) => {
        await renewLease(trx, scope, input, token, generation);
        await trx.run(lockItemIdentity, [
          `${scope.tenantId}:${key}`,
        ]);
        if (
          !(await verifyOfflineSyncPayloadHash(
            item,
            {
              ...scope,
              agentId: options.agentId,
              orgUnitId: input.orgUnitId,
              deviceId: input.deviceId,
              batchId: input.deviceBatchId,
              now,
              receiptId: key,
            },
            options.ports.payloadHashPort,
          ))
        ) {
          // ADR-MOBILE-OFFLINE-0003 D4: a non-canonical hash is diverted here, before any statement a
          // CHECK could reject. Only the attempt row records the received value; no queue row, item
          // receipt, consumption or effect exists, so the key stays unconsumed. When the key already has
          // an original, D3 item 6 adds the integrity conflict row that references it (D4 item 4).
          const original =
            (
              await trx.run(originalItemIdentity,
                [scope.tenantId, key],
              )
            )[0] ?? null;
          const stynx = await integrityRejection(
            trx,
            scope,
            input,
            item,
            key,
            original,
            options,
            now,
          );
          return {
            kind: 'non-canonical' as const,
            stynx,
            receipt: {
              queue_item_id: item.queueItemId,
              status: 'rejected' as const,
              error_code: 'OFFLINE_SYNC_ITEM_INTEGRITY',
              payload_hash: item.payloadHash,
            },
          };
        }
        await trx.run(insertDurableQueueItem,
          [
            item.queueItemId,
            scope.tenantId,
            input.deviceBatchId,
            input.orgUnitId,
            options.agentId,
            input.deviceId,
            item.entityType,
            item.localEntityId,
            key,
            item.payloadHash,
            JSON.stringify(item.payloadJson),
            item.reservedNumber ?? null,
            item.createdLocallyAt,
            now,
            initialStatus,
          ],
        );
        const stored = (
          await trx.run(storedItemIdentity,
            [scope.tenantId, key],
          )
        )[0];
        if (!stored) {
          await trx.run(appendQueueReuseAttempt,
            [
              scope.tenantId,
              input.deviceId,
              input.deviceBatchId,
              item.queueItemId,
              key,
              item.payloadHash,
            ],
          );
          return {
            kind: 'queue-reused' as const,
            receipt: {
              queue_item_id: item.queueItemId,
              status: 'rejected' as const,
              error_code: 'OFFLINE_SYNC_QUEUE_ID_REUSED',
              payload_hash: item.payloadHash,
            },
          };
        }
        if (stored.identity_mode === 'e6') {
          await trx.run(ensureLegacyBatch,
            [
              scope.tenantId,
              stored.device_id,
              stored.device_batch_id,
              stored.org_unit_id,
              stored.agent_id,
              JSON.stringify([key]),
            ],
          );
          await trx.run(ensureLegacyReceipt,
            [
              scope.tenantId,
              key,
              stored.id,
              stored.device_id,
              stored.device_batch_id,
              stored.payload_hash,
              stored.status,
            ],
          );
          if (stored.status === 'received' && stored.payload_hash === item.payloadHash) {
            await trx.run(appendLegacyUnappliedAttempt,
              [
                scope.tenantId,
                input.deviceId,
                input.deviceBatchId,
                item.queueItemId,
                key,
                item.payloadHash,
              ],
            );
            return {
              kind: 'legacy-received' as const,
              receipt: {
                queue_item_id: item.queueItemId,
                status: 'rejected' as const,
                error_code: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED',
                payload_hash: item.payloadHash,
              },
            };
          }
        }
        const insertedReceipt = await executeTypedQueryResult(trx, insertInitialReceipt,
          [
            scope.tenantId,
            key,
            item.queueItemId,
            input.deviceId,
            input.deviceBatchId,
            item.payloadHash,
            item.idempotencyKey ? null : 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED',
            initialStatus,
          ],
        );
        const receipt = (
          await trx.run(lockInitialReceipt,
            [scope.tenantId, key],
          )
        )[0]!;
        if (receipt.payload_hash !== item.payloadHash) {
          const stynx = await integrityRejection(
            trx,
            scope,
            input,
            item,
            key,
            stored,
            options,
            now,
          );
          return { kind: 'integrity' as const, receipt, stynx };
        }
        // ADR-MOBILE-OFFLINE-0003 D1 item 4: a `pending` receipt is applied again only by a later batch of
        // the same device under a different batch id with the identical hash (checked above).
        if (
          receipt.status === 'pending' &&
          receipt.device_id === input.deviceId &&
          receipt.device_batch_id !== input.deviceBatchId &&
          options.ports.itemApplier
        )
          return { kind: 'reapply' as const, receipt };
        if (
          receipt.device_id !== input.deviceId ||
          receipt.device_batch_id !== input.deviceBatchId ||
          receipt.queue_item_id !== item.queueItemId ||
          receipt.status !== initialStatus ||
          splitStynxContext(receipt.context_json).stynx?.terminalReceived === true ||
          (!item.idempotencyKey && !insertedReceipt.rowCount)
        ) {
          if (
            receipt.device_id !== input.deviceId ||
            receipt.device_batch_id !== input.deviceBatchId ||
            receipt.queue_item_id !== item.queueItemId
          ) {
            await trx.run(appendDuplicateAttempt,
              [
                scope.tenantId,
                input.deviceId,
                input.deviceBatchId,
                item.queueItemId,
                key,
                item.payloadHash,
                receipt.status,
                receipt.error_code,
                JSON.stringify({
                  ...(options.ports.domainOutcomeClassifier ? receipt.context_json : {}),
                  originalQueueItemId: receipt.queue_item_id,
                }),
              ],
            );
          }
          return { kind: 'duplicate' as const, receipt };
        }
        return { kind: 'apply' as const, receipt };
      });
      if (preflight.kind !== 'apply' && preflight.kind !== 'reapply') {
        if (
          preflight.kind === 'legacy-received' ||
          (preflight.kind === 'duplicate' &&
            (preflight.receipt.device_id !== input.deviceId ||
              preflight.receipt.device_batch_id !== input.deviceBatchId))
        )
          duplicates += 1;
        const status: SyncItemReceipt['status'] =
          preflight.kind === 'integrity' ||
          preflight.kind === 'non-canonical' ||
          preflight.kind === 'queue-reused' ||
          preflight.kind === 'legacy-received'
            ? 'rejected'
            : preflight.receipt.status;
        const errorCode =
          preflight.kind === 'integrity'
            ? 'OFFLINE_SYNC_ITEM_INTEGRITY'
            : preflight.receipt.error_code;
        if (
          status === initialStatus &&
          item.idempotencyKey &&
          options.ports.itemApplier &&
          !(
            preflight.kind === 'duplicate' &&
            splitStynxContext(preflight.receipt.context_json).stynx?.terminalReceived === true
          )
        )
          retryable = true;
        const duplicateContext =
          preflight.kind === 'duplicate'
            ? {
                ...splitStynxContext(preflight.receipt.context_json).context,
                ...(preflight.receipt.queue_item_id !== item.queueItemId
                  ? { originalQueueItemId: preflight.receipt.queue_item_id }
                  : {}),
              }
            : null;
        const originalStynx =
          'stynx' in preflight
            ? preflight.stynx
            : preflight.kind === 'duplicate'
              ? splitStynxContext(preflight.receipt.context_json).stynx
              : undefined;
        receipts.push({
          queueItemId: item.queueItemId,
          status,
          ...(originalStynx ? { stynx: originalStynx } : {}),
          ...(errorCode ? { errorCode } : {}),
          ...(duplicateContext && Object.keys(duplicateContext).length
            ? { context: duplicateContext }
            : {}),
        });
        results.push({
          ...item,
          tenantId: scope.tenantId,
          agentId: options.agentId,
          orgUnitId: input.orgUnitId,
          deviceId: input.deviceId,
          status,
          receivedAt: now,
          ...(errorCode ? { errorCode } : {}),
          ...(duplicateContext && Object.keys(duplicateContext).length
            ? { context: duplicateContext }
            : {}),
        });
        continue;
      }
      const reapplying = preflight.kind === 'reapply';
      let status: SyncItemReceipt['status'] = initialStatus;
      let errorCode: string | undefined = item.idempotencyKey
        ? undefined
        : 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED';
      let receiptContext: Record<string, unknown> | undefined;
      let stynx: OfflineSyncStynxContext | undefined;
      let attempts = 0;
      let refusalAttemptRecorded = false;
      let failureContext: OfflineSyncItemContext = {
        ...scope,
        agentId: options.agentId,
        orgUnitId: input.orgUnitId,
        deviceId: input.deviceId,
        batchId: input.deviceBatchId,
        now,
        receiptId: key,
      };
      // The queue row keeps its original id; a re-applying batch may declare the key under another id.
      let queueItemId = item.queueItemId;
      const itemApplier = options.ports.itemApplier;
      if (item.idempotencyKey && itemApplier) {
        try {
          const suspected = await database.txIndependent(
            async (trx) => {
              await renewLease(trx, scope, input, token, generation);
              const locked = (
                await trx.run(lockApplyingReceipt,
                  [scope.tenantId, key],
                )
              )[0];
              // Under the receipt row lock a `pending` receipt leaves that state exactly once (D1 item 4); a
              // concurrent second submission sees the committed status here and receives it as a duplicate.
              if (
                !locked ||
                locked.device_id !== input.deviceId ||
                locked.payload_hash !== item.payloadHash ||
                locked.status !== (reapplying ? 'pending' : initialStatus) ||
                (!reapplying &&
                  (locked.device_batch_id !== input.deviceBatchId ||
                    locked.queue_item_id !== item.queueItemId))
              )
                return { kind: 'duplicate' as const, status: locked?.status ?? 'received' };
              attempts = recordedAttempts(locked.context_json) + 1;
              queueItemId = locked.queue_item_id;
              const portItem = queueItemId === item.queueItemId ? item : { ...item, queueItemId };
              const originalContext = {
                ...scope,
                agentId: options.agentId,
                orgUnitId: input.orgUnitId,
                deviceId: input.deviceId,
                batchId: input.deviceBatchId,
                now,
                receiptId: key,
              };
              const prepared = await prepareOfflineSyncItem(
                trx,
                portItem,
                originalContext,
                options,
                async (id) => {
                  const found = await trx.run(queueIdentityExists,
                    [scope.tenantId, id],
                  );
                  return found[0]?.present === true;
                },
              );
              const context = prepared.context;
              failureContext = context;
              if (prepared.defer) {
                const recorded = await pgRecordConcurrency(
                  trx,
                  scope,
                  queueItemId,
                  options,
                  context,
                  prepared.pairs,
                  now,
                );
                stynx = executionStynxContext(options, {
                  ...recorded.marks,
                  receiptId: key,
                  attempts,
                  concurrencySuspected: context.concurrencySuspected,
                  concurrentPairs: context.concurrentPairs,
                });
                await trx.run(recordConcurrencyContext,
                  [scope.tenantId, key, JSON.stringify(stynx), now],
                );
                return { kind: 'conflict' as const, conflict: recorded.conflict };
              }
              let claimedConsumption: { reservationId: string; reservedNumber: number } | undefined;
              if (item.reservedNumber != null) {
                const covering = (
                  await trx.run(lockNumberCoverage,
                    [
                      scope.tenantId,
                      input.deviceId,
                      input.orgUnitId,
                      item.entityType,
                      item.reservedNumber,
                      item.reservationId ?? null,
                    ],
                  )
                );
                if (covering.length === 0)
                  throw new OfflineSyncNumberingOutcome(
                    'OFFLINE_SYNC_NUMBERING_NO_COVERAGE',
                    item.reservedNumber,
                    item.reservationId ?? null,
                  );
                if (covering.length > 1)
                  throw new OfflineSyncNumberingOutcome(
                    'OFFLINE_SYNC_NUMBERING_AMBIGUOUS',
                    item.reservedNumber,
                    null,
                  );
                const reservation = covering[0]!;
                const reservationId = reservation.id;
                const consumed = (
                  await trx.run(lockNumberConsumption,
                    [scope.tenantId, reservationId, item.reservedNumber],
                  )
                )[0];
                if (consumed?.status === 'applied')
                  throw new OfflineSyncNumberingOutcome(
                    'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED',
                    item.reservedNumber,
                    reservationId,
                  );
                if (
                  reservation.status !== 'reserved' ||
                  new Date(reservation.valid_until).getTime() < Date.parse(item.createdLocallyAt)
                )
                  throw new OfflineSyncNumberingOutcome(
                    'OFFLINE_SYNC_NUMBERING_EXPIRED',
                    item.reservedNumber,
                    reservationId,
                  );
                if (consumed && !['available', 'claimed-locally'].includes(consumed.status))
                  throw new OfflineSyncNumberingOutcome(
                    'OFFLINE_SYNC_NUMBERING_EXPIRED',
                    item.reservedNumber,
                    reservationId,
                  );
                const claimed = await executeTypedQueryResult(trx, claimNumberConsumption,
                  [scope.tenantId, reservationId, item.reservedNumber],
                );
                if (!claimed.rowCount)
                  throw new OfflineSyncNumberingOutcome(
                    'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED',
                    item.reservedNumber,
                    reservationId,
                  );
                claimedConsumption = { reservationId, reservedNumber: item.reservedNumber };
              }
              const applied = await itemApplier.apply(trx, portItem, context);
              const consumerAttributes = boundedConsumerAttributes(applied.consumerAttributes);
              const pairs = [...prepared.pairs];
              if (options.policy.concurrencyWindowMinutes && options.ports.concurrencyDetector) {
                const detection = await options.ports.concurrencyDetector.detect(
                  trx,
                  portItem,
                  context,
                );
                if (detection.suspected)
                  for (const pair of detection.pairs) {
                    if (await options.ports.handoffPort?.permits(trx, pair, context)) continue;
                    if (
                      !pairs.some(
                        (old) =>
                          [old.firstItemId, old.secondItemId].includes(pair.firstItemId) &&
                          [old.firstItemId, old.secondItemId].includes(pair.secondItemId),
                      )
                    )
                      pairs.push(pair);
                  }
              }
              const recorded = await pgRecordConcurrency(
                trx,
                scope,
                queueItemId,
                options,
                context,
                pairs,
                now,
              );
              const concurrencyConflict = recorded.conflict;
              const conflictMarks = recorded.marks;
              if (claimedConsumption) {
                await trx.run(applyNumberConsumption,
                  [scope.tenantId, claimedConsumption.reservationId, claimedConsumption.reservedNumber, applied.serverEntityId, now],
                );
              }
              if (!concurrencyConflict) {
                await trx.run(applyQueueItem,
                  [scope.tenantId, queueItemId, now],
                );
                await trx.run(applyItemReceipt,
                  [scope.tenantId, key, now],
                );
              }
              // D3 items 2 and 4: written once, in the transaction that produced them, from the injected clock
              // and the original application result; a replay returns these stored values. The platform object
              // of the receipt is replaced (an earlier attempt's failure fields are not carried), the host keys stay.
              stynx = executionStynxContext(options, {
                ...conflictMarks,
                concurrencySuspected:
                  context.concurrencySuspected !== undefined ||
                  (options.policy.concurrencyWindowMinutes && options.ports.concurrencyDetector)
                    ? pairs.length > 0
                    : undefined,
                concurrentPairs:
                  context.concurrencySuspected !== undefined ||
                  (options.policy.concurrencyWindowMinutes && options.ports.concurrencyDetector)
                    ? pairs
                    : undefined,
                receiptId: key,
                appliedAt: now,
                serverEntityId: applied.serverEntityId,
                attempts,
                consumerAttributes,
              });
              await trx.run(recordAppliedContext,
                [scope.tenantId, key, JSON.stringify(stynx), now],
              );
              // D1 item 6: a re-application never reuses the event key recorded for an earlier attempt.
              await options.ports.eventPort!.appendInTransaction(trx, {
                entity: item.entityType,
                entityId: applied.serverEntityId,
                idempotencyKey: reapplying ? `${key}:retry:${attempts}` : key,
                payload: item.payloadJson,
              });
              return { kind: 'applied' as const, conflict: concurrencyConflict };
            },
            { role: 'app', isolation: 'read committed', strictItemMode: true },
          );
          if (suspected.kind === 'duplicate') {
            status = suspected.status;
            stynx = undefined;
            if (status === initialStatus) retryable = true;
          } else status = suspected.conflict ? 'conflict' : 'applied';
          errorCode = undefined;
        } catch (error) {
          if (error instanceof OfflineSyncConfigurationError) throw error;
          const domainContext = domainErrorContext(error);
          const classification = classifyDomainOutcome(
            options.ports.domainOutcomeClassifier,
            error,
            domainContext,
            queueItemId === item.queueItemId ? item : { ...item, queueItemId },
            failureContext,
          );
          const outcome = classification.outcome;
          const classified =
            domainContext.valid &&
            classification.valid &&
            error instanceof HttpException &&
            error.getStatus() >= 400 &&
            error.getStatus() < 500 &&
            !(error instanceof OfflineSyncError && error.code === 'OFFLINE_SYNC_BATCH_CONFLICT');
          const numbering = error instanceof OfflineSyncNumberingOutcome ? error : null;
          const failedErrorCode = !domainContext.valid
            ? 'OFFLINE_SYNC_DOMAIN_CONTEXT_INVALID'
            : !classification.valid
              ? 'OFFLINE_SYNC_DOMAIN_OUTCOME_INVALID'
              : options.ports.domainOutcomeClassifier
                ? (classification.code ?? domainFailureCode(error) ?? 'OFFLINE_SYNC_ITEM_FAILED')
                : (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'OFFLINE_SYNC_ITEM_FAILED');
          errorCode = failedErrorCode;
          // A retryable failure of a re-application leaves the receipt `pending` for the resumed batch.
          const expected: SyncItemReceipt['status'] = reapplying ? 'pending' : initialStatus;
          if (numbering) {
            status = numbering.receiptStatus;
            receiptContext = numbering.context;
          } else if (outcome) {
            status = outcome.status;
            receiptContext = domainContext.context;
          } else if (classified) {
            status = 'rejected';
            receiptContext = domainContext.context;
          } else {
            status = expected;
            retryable = true;
          }
          stynx = executionStynxContext(options, {
            receiptId: key,
            errorCode,
            errorMessage: error instanceof Error ? error.message : String(error),
            attempts: attempts || undefined,
            reasonCode: numbering?.code ?? (outcome ? errorCode : undefined),
            retryable: outcome ? false : !classified,
            ...(outcome?.status === 'received' ? { terminalReceived: true } : {}),
          });
          await txDurable(database, async (trx) => {
            await renewLease(trx, scope, input, token, generation);
            if (numbering || outcome?.conflict) {
              const conflictType = numbering ? 'domain' : outcome!.conflict!.type;
              const conflictId = randomUUID();
              const itemContext = {
                ...scope,
                agentId: options.agentId,
                orgUnitId: input.orgUnitId,
                deviceId: input.deviceId,
                batchId: input.deviceBatchId,
                now,
                receiptId: key,
              };
              await trx.run(appendDomainConflict,
                [
                  conflictId,
                  scope.tenantId,
                  queueItemId,
                  item.localEntityId,
                  item.payloadHash,
                  numbering?.code ?? outcome!.conflict!.description,
                  now,
                  conflictType,
                ],
              );
              const allowedActions =
                (await options.ports.conflictResolver?.allowedActions?.(
                  trx,
                  conflictId,
                  itemContext,
                )) ??
                (conflictType === 'concurrency'
                  ? ['manual_review']
                  : ['reject', 'retry_after_correction']);
              await trx.run(appendDomainEvidence,
                [
                  scope.tenantId,
                  conflictId,
                  queueItemId,
                  JSON.stringify(allowedActions),
                  JSON.stringify({
                    ...(numbering
                      ? numbering.context
                      : domainContext.context
                        ? { context: domainContext.context }
                        : {}),
                    errorCode,
                    detectedAt: now,
                    stynx: executionStynxContext(options, {
                      receiptId: key,
                      reasonCode: errorCode,
                      errorCode,
                      attempts,
                      retryable: allowedActions.includes('retry_after_correction'),
                    }),
                  }),
                ],
              );
              if (numbering) receiptContext = { ...numbering.context, conflictId, allowedActions };
            }
            await trx.run(recordFailedReceipt,
              [
                scope.tenantId,
                key,
                status,
                failedErrorCode,
                now,
                input.deviceId,
                expected,
                receiptContext ? JSON.stringify(receiptContext) : null,
                JSON.stringify(stynx),
              ],
            );
            if (classified || outcome)
              await trx.run(recordOutcomeQueue,
                [scope.tenantId, queueItemId, status, now],
              );
            if (outcome && reapplying) {
              await trx.run(appendReapplyAttempt,
                [
                  scope.tenantId,
                  input.deviceId,
                  input.deviceBatchId,
                  item.queueItemId,
                  key,
                  item.payloadHash,
                  status,
                  failedErrorCode,
                  JSON.stringify({
                    ...receiptContext,
                    ...(queueItemId !== item.queueItemId
                      ? { originalQueueItemId: queueItemId }
                      : {}),
                    stynx,
                  }),
                ],
              );
              refusalAttemptRecorded = true;
            }
          });
        }
      }
      const resultContext = {
        ...receiptContext,
        ...(reapplying && queueItemId !== item.queueItemId
          ? { originalQueueItemId: queueItemId }
          : {}),
      };
      // D1 item 4: the re-applying batch records its outcome as an attempt; the receipt keeps its batch binding.
      if (reapplying && !refusalAttemptRecorded)
        await txDurable(database, async (trx) => {
          await renewLease(trx, scope, input, token, generation);
          await trx.run(appendFinalAttempt,
            [
              scope.tenantId,
              input.deviceId,
              input.deviceBatchId,
              item.queueItemId,
              key,
              item.payloadHash,
              status,
              errorCode ?? null,
              JSON.stringify({ ...resultContext, ...(stynx ? { stynx } : {}) }),
            ],
          );
        });
      receipts.push({
        queueItemId: item.queueItemId,
        status,
        ...(errorCode ? { errorCode } : {}),
        ...(Object.keys(resultContext).length ? { context: resultContext } : {}),
        ...(stynx ? { stynx } : {}),
      });
      results.push({
        ...item,
        tenantId: scope.tenantId,
        agentId: options.agentId,
        orgUnitId: input.orgUnitId,
        deviceId: input.deviceId,
        status,
        receivedAt: now,
        ...(errorCode ? { errorCode } : {}),
        ...(Object.keys(resultContext).length ? { context: resultContext } : {}),
        ...(stynx ? { stynx } : {}),
      });
    }
    const receipt: SyncBatchReceipt = {
      deviceId: input.deviceId,
      deviceBatchId: input.deviceBatchId,
      batchSequence: input.batchSequence ?? null,
      status: retryable ? 'open' : 'closed',
      items: receipts,
      responseStatus: retryable ? null : 201,
      responseBodyBytes: null,
      responseHeaders: captureReplayableHeaders(options.transport),
    };
    const result: CTG9SubmitSyncBatchResult = {
      batchId: input.deviceBatchId,
      acceptedItems: input.items.length,
      duplicateItems: duplicates,
      conflicts: results.filter((i) => i.status === 'conflict').map((i) => i.queueItemId),
      items: results,
      receipt,
    };
    const bytes = Buffer.from(JSON.stringify(result));
    await txDurable(database, async (trx) => {
      await renewLease(trx, scope, input, token, generation);
      const updated = await executeTypedCommand(trx, finalizeDurableBatch,
        [
          scope.tenantId,
          input.deviceId,
          input.deviceBatchId,
          receipt.status,
          receipt.responseStatus,
          retryable ? null : bytes,
          now,
          token,
          JSON.stringify(receipt.responseHeaders),
          generation,
        ],
      );
      if (!updated) failure('OFFLINE_SYNC_BATCH_CONFLICT', 409, 'Batch lease was fenced.');
    });
    return result;
  } catch (error) {
    await txDurable(database, async (trx) => {
      await trx.run(releaseDurableLease,
        [scope.tenantId, input.deviceId, input.deviceBatchId, token, generation],
      );
    }).catch(() => undefined);
    throw error;
  }
}
