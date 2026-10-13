import { HttpException } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import type { OfflineSyncService } from '../../src/offline-sync.service';
import { canonicalOfflineSyncPayloadHash } from '../../src/payload-integrity';
import type {
  CTG9SubmitSyncBatchInput,
  OfflineSyncItemContext,
  OfflineSyncEvent,
  StynxOfflineSyncModuleOptions,
} from '../../src/types';

// INV-OFFLINE-001; #317 V-03, V-04, V-07, V-08, V-10 and V-13.
// Each registration exercises a shipped store through the service boundary.
export const GAP_TENANT_A = '00000000-0000-4000-8000-0000000000d1';
export const GAP_TENANT_B = '00000000-0000-4000-8000-0000000000d2';
export const GAP_AT = '2026-10-12T12:00:00.000Z';
const actorId = 'authenticated-audit-actor';
const payload = { citation: 42 };
const batch = (id: string): CTG9SubmitSyncBatchInput => ({
  orgUnitId: 'org-a',
  deviceId: `device-${id}`,
  deviceBatchId: id,
  items: [
    {
      queueItemId: id,
      localEntityId: id,
      entityType: 'citation',
      idempotencyKey: `key-${id}`,
      createdLocallyAt: GAP_AT,
      payloadJson: payload,
      payloadHash: canonicalOfflineSyncPayloadHash(payload),
    },
  ],
});
export interface OfflineGapHarness {
  service(options?: Partial<StynxOfflineSyncModuleOptions>, tenantId?: string): OfflineSyncService;
  run<T>(tenantId: string, operation: () => Promise<T>): Promise<T>;
  tick(): void;
  appendResolution?(
    trx: import('@stynx-nyx/data').Transaction,
    event: OfflineSyncEvent,
  ): Promise<void>;
}
const applying = () => ({
  apply: vi.fn(async () => ({ serverEntityId: 'server-entity' })),
});
const events = () => ({
  appendInTransaction: vi.fn(async () => undefined),
  appendManyInTransaction: vi.fn(async () => undefined),
});
export function registerOfflineGapContracts(harness: () => OfflineGapHarness): void {
  it('V-03 exposes sequence identities as structured evidence without consuming refused sequence numbers', async () => {
    const h = harness();
    const itemApplier = applying();
    const service = h.service({ itemApplier, eventPort: events() });
    const first = { ...batch('sequence-first'), deviceId: 'sequence-device', batchSequence: 1 };
    await h.run(GAP_TENANT_A, () => service.submitSyncBatch(first));
    for (const [receivedSequence, code, status] of [
      [1, 'OFFLINE_SYNC_BATCH_CONFLICT', 409],
      [3, 'OFFLINE_SYNC_BATCH_SEQUENCE', 422],
    ] as const) {
      const input = {
        ...batch(`sequence-refused-${receivedSequence}`),
        deviceId: 'sequence-device',
        batchSequence: receivedSequence,
      };
      const error = await h
        .run(GAP_TENANT_A, () => service.submitSyncBatch(input))
        .catch((caught: unknown) => caught);
      expect(error).toMatchObject({
        code,
        context: { expectedSequence: 2, receivedSequence, deviceBatchId: input.deviceBatchId },
      });
      expect((error as HttpException).getStatus()).toBe(status);
      expect((error as HttpException).getResponse()).toMatchObject({
        context: { expectedSequence: 2, receivedSequence, deviceBatchId: input.deviceBatchId },
      });
    }
    const second = { ...batch('sequence-second'), deviceId: 'sequence-device', batchSequence: 2 };
    expect(
      (await h.run(GAP_TENANT_A, () => service.submitSyncBatch(second))).receipt.batchSequence,
    ).toBe(2);
    expect(itemApplier.apply).toHaveBeenCalledTimes(2);
  });

  it('V-04 preserves bounded domain context, response precedence and exact closed replay independently of error mutation', async () => {
    const h = harness();
    const responseContext = { field: 'plate', details: { allowed: ['A', 'B'], nullable: null } };
    const directContext = { retryReason: 'unrecognized-agent', count: 2 };
    const apply = vi.fn(async (_trx: unknown, item: { queueItemId: string }) => {
      if (item.queueItemId === 'domain-response')
        throw Object.assign(
          new HttpException({ message: 'domain refused', context: responseContext }, 422),
          { code: 'DOMAIN_REFUSED', context: { ignored: true } },
        );
      throw Object.assign(new HttpException('domain refused', 409), {
        code: 'DOMAIN_CONFLICT',
        context: directContext,
      });
    });
    const service = h.service({ itemApplier: { apply }, eventPort: events() });
    const input = {
      ...batch('domain-response'),
      items: [batch('domain-response').items[0]!, batch('domain-direct').items[0]!],
    };
    const result = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
    expect(result.receipt.items).toMatchObject([
      { status: 'rejected', errorCode: 'DOMAIN_REFUSED', context: responseContext },
      { status: 'rejected', errorCode: 'DOMAIN_CONFLICT', context: directContext },
    ]);
    const stored = await h.run(GAP_TENANT_A, () =>
      service.getSyncItemReceipt('key-domain-response'),
    );
    expect(stored.context).toEqual(responseContext);
    responseContext.details.allowed.push('C');
    directContext.count = 99;
    expect(
      (await h.run(GAP_TENANT_A, () => service.getSyncItemReceipt('key-domain-response'))).context,
    ).toEqual({ field: 'plate', details: { allowed: ['A', 'B'], nullable: null } });
    const replay = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
    expect(replay.receipt.responseBodyBytes).toEqual(result.receipt.responseBodyBytes);
    expect(replay.receipt.responseHeaders).toEqual(result.receipt.responseHeaders);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('V-04 refuses illegal or oversized domain context as retryable evidence rather than silently dropping it', async () => {
    const h = harness();
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'value', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'must-not-read';
      },
    });
    const lossyArray: unknown[] & { extra?: string } = new Array<unknown>(2);
    lossyArray[0] = 'present';
    lossyArray.extra = 'must-not-drop';
    const contexts: Record<string, unknown>[] = [
      { stynx: { version: 1, appliedAt: GAP_AT } },
      { text: 'é'.repeat(2048) },
      { number: Number.NaN },
      { value: undefined },
      { text: '\ud800' },
      { ['\ud800']: 'invalid-key' },
      { entries: lossyArray },
      accessor,
    ];
    const apply = vi.fn(async (_trx: unknown, item: { queueItemId: string }) => {
      const index = Number(item.queueItemId.slice('illegal-context-'.length));
      throw Object.assign(new HttpException('domain refused', 422), {
        code: 'DOMAIN_REFUSED',
        context: contexts[index],
      });
    });
    const service = h.service({ itemApplier: { apply }, eventPort: events() });
    for (let index = 0; index < contexts.length; index += 1) {
      const input = batch(`illegal-context-${index}`);
      const result = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
      expect(result.receipt.status).toBe('open');
      const stored = await h.run(GAP_TENANT_A, () =>
        service.getSyncItemReceipt(`key-illegal-context-${index}`),
      );
      expect(stored.status).toBe('received');
      expect(stored.errorCode).toBe('OFFLINE_SYNC_DOMAIN_CONTEXT_INVALID');
      expect(stored.stynx).toMatchObject({ retryable: true });
      expect(stored.context).toBeUndefined();
    }
    expect(getterCalls).toBe(0);
  });

  it('V-05 projects rejected attempt facts without borrowing original application identity or inventing a canonical hash', async () => {
    const h = harness();
    const itemApplier = applying();
    const service = h.service({ itemApplier, eventPort: events() });
    const original = batch('integrity-original');
    const originalReceipt = (await h.run(GAP_TENANT_A, () => service.submitSyncBatch(original)))
      .receipt.items[0]!;
    expect(originalReceipt.stynx).toMatchObject({
      appliedAt: GAP_AT,
      serverEntityId: 'server-entity',
    });
    h.tick();
    const mismatchBase = batch('integrity-mismatch');
    const mismatch = {
      ...mismatchBase,
      items: [
        {
          ...mismatchBase.items[0]!,
          idempotencyKey: original.items[0]!.idempotencyKey,
          payloadHash: canonicalOfflineSyncPayloadHash({ different: true }),
        },
      ],
    };
    const malformedBase = batch('integrity-malformed');
    const malformed = {
      ...malformedBase,
      items: [{ ...malformedBase.items[0]!, payloadHash: 'sha256:not-canonical' }],
    };
    for (const input of [mismatch, malformed]) {
      const outcome = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
      const proof = await h.run(GAP_TENANT_A, () =>
        service.getSyncIntegrityRejection({
          deviceId: input.deviceId,
          deviceBatchId: input.deviceBatchId,
          queueItemId: input.items[0]!.queueItemId,
        }),
      );
      expect(outcome.receipt.items[0]).toEqual({
        queueItemId: input.items[0]!.queueItemId,
        status: 'rejected',
        errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY',
        stynx: {
          version: 1,
          receiptId: proof.idempotencyKey,
          errorCode: proof.errorCode,
          reasonCode: proof.errorCode,
          receivedPayloadHash: proof.receivedPayloadHash,
          ...(proof.storedPayloadHash ? { storedPayloadHash: proof.storedPayloadHash } : {}),
          ...(proof.originalQueueItemId ? { relatedQueueItemId: proof.originalQueueItemId } : {}),
          retryable: false,
        },
      });
      expect(proof.rejectedAt).toBe(
        input === mismatch ? '2026-10-12T12:00:01.000Z' : '2026-10-12T12:00:02.000Z',
      );
      expect(outcome.receipt.items[0]!.stynx).not.toHaveProperty('appliedAt');
      expect(outcome.receipt.items[0]!.stynx).not.toHaveProperty('serverEntityId');
      if (input === malformed) {
        expect(proof).not.toHaveProperty('storedPayloadHash');
        expect(outcome.receipt.items[0]!.stynx).not.toHaveProperty('storedPayloadHash');
      }
      h.tick();
      expect(await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input))).toEqual(outcome);
      expect(
        await h.run(GAP_TENANT_A, () =>
          service.getSyncIntegrityRejection({
            deviceId: input.deviceId,
            deviceBatchId: input.deviceBatchId,
            queueItemId: input.items[0]!.queueItemId,
          }),
        ),
      ).toEqual(proof);
    }
    expect(
      await h.run(GAP_TENANT_A, () =>
        service.getSyncItemReceipt(original.items[0]!.idempotencyKey!),
      ),
    ).toEqual(originalReceipt);
    expect(itemApplier.apply).toHaveBeenCalledTimes(1);
  });

  it('V-07 records source-pending signal only for an unresolved concurrency window and preserves it on closed replay', async () => {
    const h = harness();
    const detect = vi.fn(async () => ({ suspected: false, pairs: [] }));
    const options = {
      itemApplier: applying(),
      eventPort: events(),
      concurrencyDetector: { detect },
    };
    const pending = h.service({
      ...options,
      policyResolver: {
        resolve: async () => ({ reservationTtlMs: 60_000, concurrencyWindowMinutes: null }),
      },
    });
    const input = batch('source-pending');
    const original = await h.run(GAP_TENANT_A, () => pending.submitSyncBatch(input));
    const proof = await h.run(GAP_TENANT_A, () => pending.getSyncItemReceipt('key-source-pending'));
    expect(proof.stynx).toMatchObject({
      signals: [{ code: 'SYNC_CONCURRENCY_WINDOW_SOURCE_PENDING' }],
    });
    expect(detect).not.toHaveBeenCalled();
    const disabled = h.service({
      ...options,
      policyResolver: {
        resolve: async () => ({ reservationTtlMs: 60_000, concurrencyWindowMinutes: 0 }),
      },
    });
    await h.run(GAP_TENANT_A, () => disabled.submitSyncBatch(batch('source-disabled')));
    expect(
      (await h.run(GAP_TENANT_A, () => disabled.getSyncItemReceipt('key-source-disabled'))).stynx,
    ).not.toHaveProperty('signals');
    const replay = await h.run(GAP_TENANT_A, () => disabled.submitSyncBatch(input));
    expect(replay.receipt.responseBodyBytes).toEqual(original.receipt.responseBodyBytes);
    expect(
      (await h.run(GAP_TENANT_A, () => disabled.getSyncItemReceipt('key-source-pending'))).stynx,
    ).toEqual(proof.stynx);
    expect(detect).not.toHaveBeenCalled();
  });

  it('V-10 passes a business-agent candidate only to its resolver and preserves authenticated audit identity', async () => {
    const h = harness();
    const resolve = vi.fn(
      async (_scope: unknown, _operation: string, request?: { agentId: string }) =>
        request ? 'approved-business-agent' : 'legacy-business-agent',
    );
    const seen: OfflineSyncItemContext[] = [];
    const apply = vi.fn(async (_trx: unknown, _item: unknown, context: OfflineSyncItemContext) => {
      seen.push(context);
      return { serverEntityId: 'agent-server' };
    });
    const service = h.service({
      agentResolver: { resolve },
      itemApplier: { apply },
      eventPort: events(),
    });
    const input = { ...batch('agent-candidate'), agentId: 'requested-business-agent' };
    const result = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
    expect(resolve).toHaveBeenCalledWith({ tenantId: GAP_TENANT_A, actorId }, 'submit-sync-batch', {
      agentId: 'requested-business-agent',
    });
    expect(result.items[0]).toMatchObject({ agentId: 'approved-business-agent' });
    expect(seen[0]).toMatchObject({
      tenantId: GAP_TENANT_A,
      actorId,
      agentId: 'approved-business-agent',
    });
    await h.run(GAP_TENANT_A, () => service.submitSyncBatch(batch('agent-legacy')));
    expect(resolve.mock.calls[1]).toEqual([
      { tenantId: GAP_TENANT_A, actorId },
      'submit-sync-batch',
    ]);
    await expect(
      h.run(GAP_TENANT_A, () =>
        service.submitSyncBatch({ ...input, agentId: 'different-candidate' }),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    const reservationInput = {
      orgUnitId: 'org-a',
      deviceId: 'agent-reservation-device',
      shiftId: null,
      entityType: 'citation',
      requestedSize: 1,
      idempotencyKey: 'agent-reservation-key',
      agentId: 'requested-business-agent',
    };
    const reservation = await h.run(GAP_TENANT_A, () =>
      service.reserveDurableNumbering(reservationInput),
    );
    expect(reservation.agentId).toBe('approved-business-agent');
    expect(resolve).toHaveBeenCalledWith({ tenantId: GAP_TENANT_A, actorId }, 'reserve-numbering', {
      agentId: 'requested-business-agent',
    });
    expect(
      await h.run(GAP_TENANT_A, () => service.reserveDurableNumbering(reservationInput)),
    ).toEqual(reservation);
    await expect(
      h.run(GAP_TENANT_A, () =>
        service.reserveDurableNumbering({ ...reservationInput, agentId: 'different-candidate' }),
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT' });
    const withoutResolver = h.service({ itemApplier: { apply }, eventPort: events() });
    await expect(
      h.run(GAP_TENANT_A, () =>
        withoutResolver.submitSyncBatch({ ...batch('agent-unbound'), agentId: 'forged-agent' }),
      ),
    ).rejects.toThrow();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('V-08 appends one event per accepted action after durable state and rolls every change back when append fails', async () => {
    const h = harness();
    let failAppend = true;
    const captured: OfflineSyncEvent[] = [];
    const resolutionEventPort = {
      appendInTransaction: vi.fn(
        async (trx: import('@stynx-nyx/data').Transaction, event: OfflineSyncEvent) => {
          if (failAppend) throw new Error('resolution event unavailable');
          await h.appendResolution?.(trx, event);
          captured.push(event);
        },
      ),
      appendManyInTransaction: vi.fn(async () => undefined),
    };
    const conflictResolver = {
      allowedActions: async () => ['manual_review', 'reject'] as const,
      resolve: async (_trx: unknown, conflictId: string, action: string) => ({
        conflictId,
        tenantId: 'forged-tenant',
        queueItemId: 'forged-item',
        localEntityId: 'forged-local',
        payloadHash: 'forged-hash',
        conflictType: 'domain',
        description: 'review',
        status: action === 'manual_review' ? ('open' as const) : ('resolved' as const),
      }),
    };
    const service = h.service({
      itemApplier: applying(),
      eventPort: events(),
      conflictResolver,
      resolutionEventPort,
    });
    const submitted = await h.run(GAP_TENANT_A, () =>
      service.submitSyncBatch({
        ...batch('resolution-proof'),
        items: [{ ...batch('resolution-proof').items[0]!, reservedNumber: 999 }],
      }),
    );
    const conflictId = submitted.receipt.items[0]!.context!.conflictId as string;
    await expect(
      h.run(GAP_TENANT_A, () => service.resolveConflict(conflictId, { resolution: 'reject' })),
    ).rejects.toThrow('resolution event unavailable');
    expect(
      (await h.run(GAP_TENANT_A, () => service.listSyncConflictActions({ conflictId }))).items,
    ).toEqual([]);
    expect(
      (
        await h.run(GAP_TENANT_A, () =>
          service.listSyncConflicts({ queueItemId: 'resolution-proof' }),
        )
      ).items[0],
    ).toMatchObject({ conflictId, status: 'open' });
    expect(captured).toEqual([]);
    failAppend = false;
    await h.run(GAP_TENANT_A, () =>
      service.resolveConflict(conflictId, { resolution: 'manual_review' }),
    );
    await h.run(GAP_TENANT_A, () => service.resolveConflict(conflictId, { resolution: 'reject' }));
    const actions = (
      await h.run(GAP_TENANT_A, () => service.listSyncConflictActions({ conflictId }))
    ).items;
    expect(actions).toHaveLength(2);
    for (const action of actions)
      expect(captured).toContainEqual({
        entity: 'offline.sync-conflict',
        entityId: conflictId,
        idempotencyKey: `stynx:offline-sync:resolution:${action.actionId}`,
        payload: {
          actionId: action.actionId,
          conflictId,
          queueItemId: 'resolution-proof',
          action: action.action,
          resultingStatus: action.resultingStatus,
          actorId,
          at: GAP_AT,
        },
      });
    expect(captured).toHaveLength(2);
    await expect(
      h.run(GAP_TENANT_A, () => service.resolveConflict(conflictId, { resolution: 'reject' })),
    ).rejects.toBeInstanceOf(HttpException);
    expect(resolutionEventPort.appendInTransaction).toHaveBeenCalledTimes(3);
    expect(resolutionEventPort.appendManyInTransaction).not.toHaveBeenCalled();
  });

  it('V-08 isolates a failing resolution from another conflict history and serializes terminal contenders', async () => {
    const h = harness();
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let failingConflict = '';
    const appended: string[] = [];
    const resolutionEventPort = {
      appendInTransaction: async (
        trx: import('@stynx-nyx/data').Transaction,
        event: OfflineSyncEvent,
      ) => {
        if (event.entityId === failingConflict) {
          enter();
          await waiting;
          throw new Error('isolated resolution failure');
        }
        await h.appendResolution?.(trx, event);
        appended.push(event.entityId);
      },
      appendManyInTransaction: async () => undefined,
    };
    const service = h.service({
      itemApplier: applying(),
      eventPort: events(),
      resolutionEventPort,
      conflictResolver: {
        allowedActions: async () => ['reject'],
        resolve: async (_trx, conflictId) => ({
          conflictId,
          tenantId: GAP_TENANT_A,
          queueItemId: '',
          localEntityId: '',
          payloadHash: '',
          conflictType: 'domain',
          description: 'resolved',
          status: 'resolved',
        }),
      },
    });
    const conflicts: string[] = [];
    for (const id of [
      'resolution-race-fail',
      'resolution-race-other',
      'resolution-race-contenders',
    ]) {
      const result = await h.run(GAP_TENANT_A, () =>
        service.submitSyncBatch({
          ...batch(id),
          items: [{ ...batch(id).items[0]!, reservedNumber: 999 }],
        }),
      );
      conflicts.push(result.receipt.items[0]!.context!.conflictId as string);
    }
    failingConflict = conflicts[0]!;
    const failed = h
      .run(GAP_TENANT_A, () => service.resolveConflict(failingConflict, { resolution: 'reject' }))
      .catch((error: unknown) => error);
    await entered;
    try {
      await h.run(GAP_TENANT_A, () =>
        service.resolveConflict(conflicts[1]!, { resolution: 'reject' }),
      );
    } finally {
      release();
    }
    expect(await failed).toBeInstanceOf(Error);
    expect(
      (
        await h.run(GAP_TENANT_A, () =>
          service.listSyncConflictActions({ conflictId: failingConflict }),
        )
      ).items,
    ).toEqual([]);
    expect(
      (
        await h.run(GAP_TENANT_A, () =>
          service.listSyncConflictActions({ conflictId: conflicts[1]! }),
        )
      ).items,
    ).toHaveLength(1);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 2 }, () =>
        h.run(GAP_TENANT_A, () => service.resolveConflict(conflicts[2]!, { resolution: 'reject' })),
      ),
    );
    expect(outcomes.map((value) => value.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(
      (
        await h.run(GAP_TENANT_A, () =>
          service.listSyncConflictActions({ conflictId: conflicts[2]! }),
        )
      ).items,
    ).toHaveLength(1);
    expect(appended.sort()).toEqual([conflicts[1]!, conflicts[2]!].sort());
  });

  it('V-13 appends tenant-scoped immutable reconciliation snapshots with exact keyed replay and no post-close revival', async () => {
    const h = harness();
    const service = h.service();
    const reservation = await h.run(GAP_TENANT_A, () =>
      service.reserveDurableNumbering({
        orgUnitId: 'org-a',
        deviceId: 'reconciliation-device',
        shiftId: null,
        entityType: 'citation',
        requestedSize: 3,
      }),
    );
    const input = {
      claimedNumbers: [
        reservation.startNumber + 1,
        reservation.startNumber,
        reservation.startNumber,
      ],
      userRef: 'business-reviewer',
      idempotencyKey: 'reconciliation-key',
    };
    const first = await h.run(GAP_TENANT_A, () =>
      service.reconcileNumberingReservation(reservation.reservationId, input),
    );
    expect(first.reconciliationId).toEqual(expect.any(String));
    expect(first.missingOnServer).toEqual([reservation.startNumber, reservation.startNumber + 1]);
    h.tick();
    expect(
      await h.run(GAP_TENANT_A, () =>
        service.reconcileNumberingReservation(reservation.reservationId, {
          ...input,
          claimedNumbers: [...input.claimedNumbers].reverse(),
        }),
      ),
    ).toEqual(first);
    await expect(
      h.run(GAP_TENANT_A, () =>
        service.reconcileNumberingReservation(reservation.reservationId, {
          ...input,
          claimedNumbers: [],
        }),
      ),
    ).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_RECONCILIATION_IDEMPOTENCY_CONFLICT',
      status: 409,
    });
    const history = await h.run(GAP_TENANT_A, () =>
      service.listNumberingReconciliations({ reservationId: reservation.reservationId }),
    );
    expect(history.items).toEqual([
      {
        reconciliationId: first.reconciliationId,
        tenantId: GAP_TENANT_A,
        reservationId: reservation.reservationId,
        actorId,
        createdAt: GAP_AT,
        claimedNumbers: [reservation.startNumber, reservation.startNumber + 1],
        userRef: 'business-reviewer',
        idempotencyKey: 'reconciliation-key',
        result: first,
      },
    ]);
    expect(
      (
        await h.run(GAP_TENANT_B, () =>
          h
            .service({}, GAP_TENANT_B)
            .listNumberingReconciliations({ reservationId: reservation.reservationId }),
        )
      ).items,
    ).toEqual([]);
    await h.run(GAP_TENANT_A, () =>
      service.closeNumberingReservation(reservation.reservationId, { reason: 'complete' }),
    );
    const afterClose = await h.run(GAP_TENANT_A, () =>
      service.reconcileNumberingReservation(reservation.reservationId, {
        claimedNumbers: [reservation.endNumber],
      }),
    );
    expect(
      afterClose.consumption.find((entry) => entry.number === reservation.endNumber)?.status,
    ).toBe('expired');
    expect(afterClose.reconciliationId).not.toBe(first.reconciliationId);
    const current = await h.run(GAP_TENANT_A, () =>
      service.listNumberingReconciliations({ reservationId: reservation.reservationId, limit: 1 }),
    );
    expect(current.items).toHaveLength(1);
    expect(current.nextCursor).toEqual(expect.any(String));
    const next = await h.run(GAP_TENANT_A, () =>
      service.listNumberingReconciliations({
        reservationId: reservation.reservationId,
        limit: 1,
        cursor: current.nextCursor!,
      }),
    );
    expect(next.items).toHaveLength(1);
    expect(next.items[0]!.reconciliationId).not.toBe(current.items[0]!.reconciliationId);
    const all = await h.run(GAP_TENANT_A, () =>
      service.listNumberingReconciliations({ reservationId: reservation.reservationId }),
    );
    expect(all.items).toHaveLength(2);
    const concurrent = await Promise.all(
      Array.from({ length: 6 }, () =>
        h.run(GAP_TENANT_A, () =>
          service.reconcileNumberingReservation(reservation.reservationId, {
            claimedNumbers: [],
            idempotencyKey: 'concurrent-reconciliation',
          }),
        ),
      ),
    );
    expect(new Set(concurrent.map((entry) => entry.reconciliationId)).size).toBe(1);
    const unkeyed = await h.run(GAP_TENANT_A, () =>
      service.reconcileNumberingReservation(reservation.reservationId, { claimedNumbers: [] }),
    );
    expect(unkeyed.reconciliationId).not.toBe(concurrent[0]!.reconciliationId);
    expect(
      (
        await h.run(GAP_TENANT_A, () =>
          service.listNumberingReconciliations({ reservationId: reservation.reservationId }),
        )
      ).items,
    ).toHaveLength(4);

    expect(
      all.items.find((entry) => entry.reconciliationId === first.reconciliationId)!.result,
    ).toEqual(first);
  });
}
