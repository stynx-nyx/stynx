import { HttpException } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import { OfflineSyncError, OfflineSyncConfigurationError } from '../../src/errors';
import { canonicalOfflineSyncPayloadHash } from '../../src/payload-integrity';
import type { CTG9SubmitSyncBatchInput, OfflineSyncDomainOutcomeClassifier } from '../../src/types';
import {
  GAP_AT,
  GAP_TENANT_A,
  GAP_TENANT_B,
  type OfflineGapHarness,
} from './offline-sync-acceptance-gaps';

// INV-OFFLINE-001; ADR-MOBILE-OFFLINE-0005 D1.1. Same behavioral observations on both shipped stores.
export const domainBatch = (id: string): CTG9SubmitSyncBatchInput => ({
  orgUnitId: 'org-a',
  deviceId: `domain-device-${id}`,
  deviceBatchId: id,
  items: [
    {
      queueItemId: id,
      localEntityId: `local-${id}`,
      entityType: 'citation',
      idempotencyKey: `key-${id}`,
      createdLocallyAt: GAP_AT,
      payloadJson: { citation: 42 },
      payloadHash: canonicalOfflineSyncPayloadHash({ citation: 42 }),
    },
  ],
});
export const domainFailure = (context: Record<string, unknown> = { field: 'plate' }) =>
  Object.assign(new Error('consumer business failure'), { code: 'BUSINESS_CLOSED', context });
export const domainEvents = () => ({
  appendInTransaction: vi.fn(async () => undefined),
  appendManyInTransaction: vi.fn(async () => undefined),
});

export interface OfflineDomainHarness extends OfflineGapHarness {
  readConflictActions(conflictId: string): Promise<readonly string[]>;
}
export function registerDomainOutcomeContracts(harness: () => OfflineDomainHarness): void {
  it('D1.1 preserves absent and undefined classifier defaults for unknown HTTP and plain coded failures', async () => {
    const h = harness();
    for (const [index, classifier] of [undefined, { classify: vi.fn(() => undefined) }].entries()) {
      for (const http of [false, true]) {
        const input = domainBatch(`fallback-${index}-${http}`);
        const error = http
          ? Object.assign(new HttpException('business failed', 422), {
              code: 'UNKNOWN_BUSINESS_CODE',
              context: { original: true },
            })
          : domainFailure();
        const service = h.service({
          itemApplier: {
            apply: async () => {
              throw error;
            },
          },
          eventPort: domainEvents(),
          ...(classifier ? { domainOutcomeClassifier: classifier } : {}),
        });
        const result = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
        expect(result.receipt.status).toBe(http ? 'closed' : 'open');
        expect(result.receipt.items[0]).toMatchObject({
          status: http ? 'rejected' : 'received',
          errorCode: http ? 'UNKNOWN_BUSINESS_CODE' : 'BUSINESS_CLOSED',
        });
        expect(result.receipt.items[0]!.stynx).not.toHaveProperty('terminalReceived');
        if (classifier) expect(classifier.classify).toHaveBeenCalledTimes(http ? 2 : 1);
      }
    }
  });

  for (const status of ['received', 'rejected', 'conflict'] as const)
    it(`D1.1 persists classified ${status} without application provenance and preserves terminal replay`, async () => {
      const h = harness();
      const input = domainBatch(`terminal-${status}`);
      const consumer = {
        conflictId: 'consumer-conflict-id',
        allowedActions: ['consumer-action'],
        nested: { original: true },
      };
      const error = domainFailure(consumer);
      const apply = vi.fn(async () => {
        throw error;
      });
      const classify = vi.fn(() => ({ status }));
      const eventPort = domainEvents();
      const service = h.service({
        itemApplier: { apply },
        eventPort,
        domainOutcomeClassifier: { classify },
      });
      const original = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
      expect(original.receipt.status).toBe('closed');
      expect(original.receipt.items[0]).toMatchObject({
        status,
        errorCode: 'BUSINESS_CLOSED',
        context: consumer,
        stynx: { receiptId: `key-terminal-${status}`, retryable: false, attempts: 1 },
      });
      const stored = await h.run(GAP_TENANT_A, () =>
        service.getSyncItemReceipt(input.items[0]!.idempotencyKey!),
      );
      expect(stored.context).toEqual(consumer);
      expect(stored.stynx).not.toHaveProperty('appliedAt');
      expect(stored.stynx).not.toHaveProperty('serverEntityId');
      if (status === 'received') expect(stored.stynx).toMatchObject({ terminalReceived: true });
      else expect(stored.stynx).not.toHaveProperty('terminalReceived');
      expect(
        (await h.run(GAP_TENANT_A, () => service.listSyncQueueItems({ deviceId: input.deviceId })))
          .items[0],
      ).toMatchObject({ status, tenantId: GAP_TENANT_A });
      expect(
        (
          await h.run(GAP_TENANT_A, () =>
            service.listSyncConflicts({ queueItemId: input.items[0]!.queueItemId }),
          )
        ).items,
      ).toEqual([]);
      consumer.nested.original = false;
      h.tick();
      const replay = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
      expect(replay.receipt.responseBodyBytes).toEqual(original.receipt.responseBodyBytes);
      expect(replay.receipt.items).toEqual(original.receipt.items);
      const duplicateBase = domainBatch(`terminal-${status}-duplicate`);
      const duplicate = {
        ...duplicateBase,
        items: [{ ...duplicateBase.items[0]!, idempotencyKey: input.items[0]!.idempotencyKey }],
      };
      const duplicated = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(duplicate));
      expect(duplicated.duplicateItems).toBe(1);
      expect(duplicated.receipt.status).toBe('closed');
      expect(duplicated.receipt.items[0]).toMatchObject({
        status,
        errorCode: 'BUSINESS_CLOSED',
        context: { nested: { original: true } },
        stynx: stored.stynx,
      });
      expect(
        await h.run(GAP_TENANT_A, () =>
          service.getSyncItemReceipt(input.items[0]!.idempotencyKey!),
        ),
      ).toEqual(stored);
      expect(apply).toHaveBeenCalledTimes(1);
      expect(classify).toHaveBeenCalledTimes(1);
      expect(eventPort.appendInTransaction).not.toHaveBeenCalled();
      const otherTenant = h.service(
        { itemApplier: { apply }, eventPort, domainOutcomeClassifier: { classify } },
        GAP_TENANT_B,
      );
      expect(
        (
          await h.run(GAP_TENANT_B, () =>
            otherTenant.listSyncQueueItems({ deviceId: input.deviceId }),
          )
        ).items,
      ).toEqual([]);
      expect(
        (
          await h.run(GAP_TENANT_B, () =>
            otherTenant.listSyncItemReceipts({ deviceId: input.deviceId }),
          )
        ).items,
      ).toEqual([]);
      const changed = {
        ...domainBatch(`changed-${status}`),
        items: [
          {
            ...duplicate.items[0]!,
            queueItemId: `changed-${status}`,
            payloadJson: { citation: 43 },
            payloadHash: canonicalOfflineSyncPayloadHash({ citation: 43 }),
          },
        ],
      };
      expect(
        (await h.run(GAP_TENANT_A, () => service.submitSyncBatch(changed))).receipt.items[0],
      ).toMatchObject({ status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' });
      expect(apply).toHaveBeenCalledTimes(1);
      expect(classify).toHaveBeenCalledTimes(1);
    });

  for (const type of ['domain', 'concurrency'] as const)
    it(`D1.1 opens a trusted ${type} conflict without overwriting consumer context`, async () => {
      const h = harness();
      const input = domainBatch(`descriptor-${type}`);
      const consumer = {
        conflictId: 'consumer-id',
        allowedActions: ['consumer-value'],
        context: { plate: 'ABC' },
      };
      const allowedActions = vi.fn(
        async (
          _trx: unknown,
          _id: string,
          _context: import('../../src/types').OfflineSyncItemContext,
        ) => ['reject', 'retry_after_correction'] as const,
      );
      for (const override of [false, true]) {
        const current = override ? domainBatch(`descriptor-${type}-hook`) : input;
        const service = h.service({
          itemApplier: {
            apply: async () => {
              throw domainFailure(consumer);
            },
          },
          eventPort: domainEvents(),
          domainOutcomeClassifier: {
            classify: () => ({
              status: 'rejected',
              conflict: { type, description: 'Consumer collision' },
            }),
          },
          ...(override
            ? {
                conflictResolver: {
                  allowedActions,
                  resolve: async () => {
                    throw new Error('unused');
                  },
                },
              }
            : {}),
        });
        const result = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(current));
        expect(result.receipt.status).toBe('closed');
        expect(result.receipt.items[0]!.context).toEqual(consumer);
        const conflicts = (
          await h.run(GAP_TENANT_A, () =>
            service.listSyncConflicts({ queueItemId: current.items[0]!.queueItemId }),
          )
        ).items;
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0]).toMatchObject({
          tenantId: GAP_TENANT_A,
          queueItemId: current.items[0]!.queueItemId,
          localEntityId: current.items[0]!.localEntityId,
          payloadHash: current.items[0]!.payloadHash,
          conflictType: type,
          description: 'Consumer collision',
          status: 'open',
          createdAt: GAP_AT,
        });
        expect(conflicts[0]!.conflictId).not.toBe('consumer-id');
        expect(
          await h.run(GAP_TENANT_A, () => h.readConflictActions(conflicts[0]!.conflictId)),
        ).toEqual(
          override || type === 'domain' ? ['reject', 'retry_after_correction'] : ['manual_review'],
        );
        expect(
          (
            await h.run(GAP_TENANT_B, () =>
              h
                .service({}, GAP_TENANT_B)
                .listSyncConflicts({ queueItemId: current.items[0]!.queueItemId }),
            )
          ).items,
        ).toEqual([]);
      }
      expect(allowedActions).toHaveBeenCalledTimes(1);
      expect(allowedActions.mock.calls[0]![2]).toMatchObject({
        tenantId: GAP_TENANT_A,
        actorId: 'authenticated-audit-actor',
        receiptId: `key-descriptor-${type}-hook`,
      });
    });

  it('D1.1 gives classifier detached closed failure data and original trusted identities', async () => {
    const h = harness();
    const input = { ...domainBatch('detached'), agentId: 'requested-agent' };
    const consumer = { nested: { original: true } };
    const error = Object.assign(
      new HttpException({ message: 'business refusal', context: consumer }, 422),
      { code: 'BUSINESS_CLOSED', context: { ignored: true } },
    );
    const classify: OfflineSyncDomainOutcomeClassifier['classify'] = vi.fn(
      (failure, item, context) => {
        expect(failure).toEqual({ code: 'BUSINESS_CLOSED', httpStatus: 422, context: consumer });
        expect(Object.keys(failure).sort()).toEqual(['code', 'context', 'httpStatus']);
        expect(context).toMatchObject({
          tenantId: GAP_TENANT_A,
          actorId: 'authenticated-audit-actor',
          agentId: 'effective-business-agent',
          orgUnitId: input.orgUnitId,
          deviceId: input.deviceId,
          batchId: input.deviceBatchId,
          now: GAP_AT,
          receiptId: 'key-detached',
        });
        expect(item).not.toBe(input.items[0]);
        expect(item.payloadJson).not.toBe(input.items[0]!.payloadJson);
        expect(failure.context).not.toBe(consumer);
        try {
          (item.payloadJson as Record<string, unknown>).citation = 99;
        } catch {
          /* Frozen detached inputs are valid. */
        }
        try {
          (failure.context!.nested as Record<string, unknown>).original = false;
        } catch {
          /* Frozen detached inputs are valid. */
        }
        try {
          (context as unknown as Record<string, unknown>).actorId = 'forged';
        } catch {
          /* Frozen detached inputs are valid. */
        }
        return { status: 'received' };
      },
    );
    const service = h.service({
      agentResolver: { resolve: async () => 'effective-business-agent' },
      itemApplier: {
        apply: async () => {
          throw error;
        },
      },
      eventPort: domainEvents(),
      domainOutcomeClassifier: { classify },
    });
    await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
    expect(classify).toHaveBeenCalledTimes(1);
    expect(input.items[0]!.payloadJson).toEqual({ citation: 42 });
    expect(consumer).toEqual({ nested: { original: true } });
    const stored = await h.run(GAP_TENANT_A, () => service.getSyncItemReceipt('key-detached'));
    expect(stored.context).toEqual({ nested: { original: true } });
    expect(
      (await h.run(GAP_TENANT_A, () => service.listSyncQueueItems({ deviceId: input.deviceId })))
        .items[0],
    ).toMatchObject({ agentId: 'effective-business-agent', payloadJson: { citation: 42 } });
  });

  it('D1.1 bypasses classifier for platform, reserved, uncoded, malformed and invalid-context failures', async () => {
    const h = harness();
    let getterCalls = 0;
    const malformed = Object.defineProperty(new Error('coded accessor'), 'code', {
      get: () => {
        getterCalls += 1;
        return 'BUSINESS_CLOSED';
      },
    });
    const cases = [
      new Error('BUSINESS_CLOSED'),
      malformed,
      Object.assign(new Error('blank'), { code: ' ' }),
      Object.assign(new Error('large'), { code: 'é'.repeat(128) }),
      Object.assign(new Error('number'), { code: 42 }),
      Object.assign(new Error('illegal code'), { code: '\ud800' }),
      Object.assign(Object.create({ code: 'BUSINESS_INHERITED' }) as Error, {
        message: 'inherited code',
      }),
      new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 422, 'platform'),
      Object.assign(new Error('reserved'), { code: 'OFFLINE_SYNC_CONSUMER_FORGERY' }),
      domainFailure({ stynx: { terminalReceived: true } }),
    ];
    const classify = vi.fn(() => ({ status: 'received' as const }));
    for (const [index, error] of cases.entries()) {
      const service = h.service({
        itemApplier: {
          apply: async () => {
            throw error;
          },
        },
        eventPort: domainEvents(),
        domainOutcomeClassifier: { classify },
      });
      const result = await h.run(GAP_TENANT_A, () =>
        service.submitSyncBatch(domainBatch(`bypass-${index}`)),
      );
      expect(result.receipt.items[0]!.stynx).not.toHaveProperty('terminalReceived');
      if (index === cases.length - 1)
        expect(result.receipt.items[0]).toMatchObject({
          status: 'received',
          errorCode: 'OFFLINE_SYNC_DOMAIN_CONTEXT_INVALID',
          stynx: { retryable: true },
        });
    }
    expect(classify).not.toHaveBeenCalled();
    expect(getterCalls).toBe(0);
    const configured = h.service({
      itemApplier: {
        apply: async () => {
          throw new OfflineSyncConfigurationError('consumer');
        },
      },
      eventPort: domainEvents(),
      domainOutcomeClassifier: { classify },
    });
    await expect(
      h.run(GAP_TENANT_A, () => configured.submitSyncBatch(domainBatch('configuration-bypass'))),
    ).rejects.toBeInstanceOf(OfflineSyncConfigurationError);
    const numbering = h.service({
      itemApplier: { apply: async () => ({ serverEntityId: 'unused' }) },
      eventPort: domainEvents(),
      domainOutcomeClassifier: { classify },
    });
    const numbered = domainBatch('numbering-bypass');
    const result = await h.run(GAP_TENANT_A, () =>
      numbering.submitSyncBatch({
        ...numbered,
        items: [{ ...numbered.items[0]!, reservedNumber: 999 }],
      }),
    );
    expect(result.receipt.items[0]).toMatchObject({
      status: 'rejected',
      errorCode: 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE',
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it('D1.1 refuses invalid, async, throwing and accessor outcomes without coercion or partial terminal state', async () => {
    const h = harness();
    let getterCalls = 0;
    let coercions = 0;
    const accessor = Object.defineProperty({}, 'status', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'received';
      },
    });
    const invalid = [
      null,
      true,
      'received',
      {},
      { status: 'applied' },
      { status: 'received', extra: true },
      { status: 'received', conflict: { type: 'domain', description: 'collision' } },
      { status: 'conflict', conflict: { type: 'integrity', description: 'collision' } },
      { status: 'conflict', conflict: { type: 'domain', description: ' ' } },
      { status: 'rejected', conflict: { type: 'domain', description: 'é'.repeat(2001) } },
      {
        status: 'rejected',
        conflict: { type: 'domain', description: 'collision', tenantId: GAP_TENANT_B },
      },
      {
        status: 'received',
        then: () => {
          coercions += 1;
        },
      },
      accessor,
      Object.assign(Object.create({ status: 'received' }), {}),
      { status: 'received', [Symbol('unknown')]: true },
      Object.defineProperty({ status: 'received' }, 'hidden', { value: true }),
      {
        status: 'rejected',
        conflict: Object.defineProperty({ type: 'domain' }, 'description', {
          enumerable: true,
          get: () => {
            getterCalls += 1;
            return 'collision';
          },
        }),
      },
      Promise.resolve({ status: 'received' }),
      {
        status: {
          toString: () => {
            coercions += 1;
            return 'received';
          },
        },
      },
    ];
    for (let index = 0; index <= invalid.length; index += 1) {
      const classify = (() => {
        if (index === invalid.length) throw new Error('classifier refused');
        return invalid[index];
      }) as OfflineSyncDomainOutcomeClassifier['classify'];
      const input = domainBatch(`invalid-outcome-${index}`);
      const service = h.service({
        initialQueueStatus: index % 2 === 0 ? 'pending' : 'received',
        itemApplier: {
          apply: async () => {
            throw domainFailure();
          },
        },
        eventPort: domainEvents(),
        domainOutcomeClassifier: { classify },
      });
      const result = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
      expect(result.receipt.status).toBe('open');
      expect(result.receipt.items[0]).toMatchObject({
        status: index % 2 === 0 ? 'pending' : 'received',
        errorCode: 'OFFLINE_SYNC_DOMAIN_OUTCOME_INVALID',
        stynx: { retryable: true },
      });
      expect(result.receipt.items[0]!.stynx).not.toHaveProperty('terminalReceived');
      expect(
        (
          await h.run(GAP_TENANT_A, () =>
            service.listSyncConflicts({ queueItemId: input.items[0]!.queueItemId }),
          )
        ).items,
      ).toEqual([]);
    }
    expect(getterCalls).toBe(0);
    expect(coercions).toBe(0);
  });

  it('D1.1 retries historical received and correction-pending state and classifies the new attempt once', async () => {
    const h = harness();
    const input = domainBatch('pending-reapplication');
    const apply = vi.fn(async () => {
      throw domainFailure();
    });
    const classify = vi.fn(
      () => undefined as ReturnType<OfflineSyncDomainOutcomeClassifier['classify']>,
    );
    const service = h.service({
      initialQueueStatus: 'pending',
      itemApplier: { apply },
      eventPort: domainEvents(),
      domainOutcomeClassifier: { classify },
    });
    const first = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
    expect(first.receipt.status).toBe('open');
    expect(first.receipt.items[0]).toMatchObject({
      status: 'pending',
      stynx: { retryable: true, attempts: 1 },
    });
    classify.mockImplementation(() => ({ status: 'received' }));
    h.tick();
    const second = await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input));
    expect(second.receipt.status).toBe('closed');
    expect(second.receipt.items[0]).toMatchObject({
      status: 'received',
      stynx: { retryable: false, terminalReceived: true, attempts: 2 },
    });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(classify).toHaveBeenCalledTimes(2);
    expect(
      (await h.run(GAP_TENANT_A, () => service.submitSyncBatch(input))).receipt.responseBodyBytes,
    ).toEqual(second.receipt.responseBodyBytes);
    expect(apply).toHaveBeenCalledTimes(2);
  });
  it('D1.1 reclassifies a correction-pending cross-batch attempt using the original queue and receipt identity', async () => {
    const h = harness();
    const input = domainBatch('correction-origin');
    const consumer = {
      conflictId: 'consumer-original-id',
      allowedActions: ['consumer-original-action'],
      originalField: { value: 42 },
    };
    let outcome: 'conflict' | 'received' = 'conflict';
    const classify = vi.fn(
      (
        _failure: unknown,
        item: import('../../src/types').CTG9SyncBatchItemInput,
        context: import('../../src/types').OfflineSyncItemContext,
      ) => {
        expect(item.queueItemId).toBe(input.items[0]!.queueItemId);
        expect(context.receiptId).toBe(input.items[0]!.idempotencyKey);
        return outcome === 'conflict'
          ? {
              status: 'conflict' as const,
              conflict: { type: 'domain' as const, description: 'correctable collision' },
            }
          : { status: 'received' as const };
      },
    );
    let originalConflict!: import('../../src/types').SyncConflictRecord;
    const subject = h.service({
      itemApplier: {
        apply: async () => {
          throw domainFailure(consumer);
        },
      },
      eventPort: domainEvents(),
      domainOutcomeClassifier: { classify },
      conflictResolver: {
        allowedActions: async () => ['retry_after_correction'],
        resolve: async () => ({ ...originalConflict, status: 'resolved' }),
      },
    });
    const original = await h.run(GAP_TENANT_A, () => subject.submitSyncBatch(input));
    expect(original.receipt.items[0]).toMatchObject({ status: 'conflict', context: consumer });
    originalConflict = (
      await h.run(GAP_TENANT_A, () =>
        subject.listSyncConflicts({ queueItemId: input.items[0]!.queueItemId }),
      )
    ).items[0]!;
    await h.run(GAP_TENANT_A, () =>
      subject.resolveConflict(originalConflict.conflictId, {
        resolution: 'retry_after_correction',
      }),
    );
    expect(
      await h.run(GAP_TENANT_A, () => subject.getSyncItemReceipt(input.items[0]!.idempotencyKey!)),
    ).toMatchObject({ status: 'pending', context: consumer });
    outcome = 'received';
    h.tick();
    const next = domainBatch('correction-next');
    const corrected = {
      ...next,
      deviceId: input.deviceId,
      items: [{ ...next.items[0]!, idempotencyKey: input.items[0]!.idempotencyKey }],
    };
    const result = await h.run(GAP_TENANT_A, () => subject.submitSyncBatch(corrected));
    expect(result.receipt.status).toBe('closed');
    expect(result.receipt.items[0]).toMatchObject({
      status: 'received',
      context: { ...consumer, originalQueueItemId: input.items[0]!.queueItemId },
      stynx: { terminalReceived: true, retryable: false, attempts: 2 },
    });
    expect(classify).toHaveBeenCalledTimes(2);
    const stored = await h.run(GAP_TENANT_A, () =>
      subject.getSyncItemReceipt(input.items[0]!.idempotencyKey!),
    );
    expect(stored).toMatchObject({
      queueItemId: input.items[0]!.queueItemId,
      status: 'received',
      context: consumer,
    });
    expect(
      (await h.run(GAP_TENANT_A, () => subject.submitSyncBatch(input))).receipt.responseBodyBytes,
    ).toEqual(original.receipt.responseBodyBytes);
    expect(classify).toHaveBeenCalledTimes(2);
  });
}
