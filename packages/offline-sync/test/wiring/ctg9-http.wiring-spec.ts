import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { IdempotencyInterceptor } from '@stynx-nyx/idempotency';
import type { INestApplication } from '@nestjs/common';
import { PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StynxOfflineSyncModule } from '../../src/offline-sync.module';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import type { OfflineSyncContextPort, StynxOfflineSyncModuleOptions } from '../../src/types';

// INV-OFFLINE-001; UPS-OFS-02. Real Nest HTTP route sensor, without DETRAN vocabulary.
const itemPayload = { normativePackageId: 'rules-1', normativePackageVersion: '1.0.0' };
const itemHash = `sha256:${createHash('sha256').update(JSON.stringify(itemPayload)).digest('hex')}`;
const payload = {
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  deviceBatchId: 'batch-a',
  batchSequence: 1,
  items: [
    {
      queueItemId: 'queue-a',
      entityType: 'citation',
      localEntityId: 'local-a',
      idempotencyKey: 'item-a',
      payloadHash: itemHash,
      payloadJson: itemPayload,
      createdLocallyAt: '2026-09-28T12:00:00.000Z',
      reservedNumber: 1000,
    },
  ],
};

describe('CTG9 OFS batch HTTP contract', () => {
  let app: INestApplication;
  let heldGate: Promise<void> | undefined;
  let releaseHeld: (() => void) | undefined;
  let signalHeld: (() => void) | undefined;
  beforeAll(async () => {
    const context: OfflineSyncContextPort = {
      current: () => ({ tenantId: '00000000-0000-4000-8000-0000000000a1', actorId: 'actor-a' }),
    };
    const store = new InMemoryOfflineSyncStore();
    store.seedNumberingRange({
      id: '10000000-0000-4000-8000-0000000000a1',
      tenantId: '00000000-0000-4000-8000-0000000000a1',
      orgUnitId: 'org-a',
      entityType: 'citation',
      series: 'C',
      startNumber: 1000,
      endNumber: 1099,
      nextNumber: 1000,
      status: 'active',
    });
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxOfflineSyncModule.forRoot({
          store,
          context,
          policyResolver: {
            resolve: async () => ({ maxBatchItems: 150, reservationTtlMs: 60_000 }),
          },
          itemApplier: {
            apply: async (_trx: unknown, current: { queueItemId: string }) => {
              if (current.queueItemId === 'held-item') {
                signalHeld?.();
                await heldGate;
              }
              return { serverEntityId: `server-${current.queueItemId}` };
            },
          },
          eventPort: {
            appendInTransaction: async () => undefined,
            appendManyInTransaction: async () => undefined,
          },
        } as StynxOfflineSyncModuleOptions),
      ],
    })
      .overrideGuard(StynxAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    const entries = new Map<string, unknown>();
    const locks = new Set<string>();
    const keyOf = (context: { compositeKey: string }) => context.compositeKey;
    app.useGlobalInterceptors(
      new IdempotencyInterceptor(new Reflector(), {}, undefined, {
        get: async (context) => (entries.get(keyOf(context)) ?? null) as never,
        set: async (context, entry) => {
          entries.set(keyOf(context), entry);
        },
        acquireLock: async (context) => {
          const key = keyOf(context);
          if (locks.has(key)) return false;
          locks.add(key);
          return true;
        },
        releaseLock: async (context) => {
          locks.delete(keyOf(context));
        },
        isLocked: async (context) => locks.has(keyOf(context)),
      }),
    );
    await app.init();
    const service = app.get(OfflineSyncService);
    await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'citation',
      requestedSize: 5,
    });
    await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'held-device',
      shiftId: 'shift-b',
      entityType: 'citation',
      requestedSize: 5,
    });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('requires a nonblank transport key at the mounted batch route', async () => {
    const missing = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .send(payload);
    expect(missing.status).toBe(400);
    const blank = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', '   ')
      .send(payload);
    expect(blank.status).toBe(400);
  });

  it('replays original status and body bytes with the incoming transport key and marker', async () => {
    const first = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'transport-one')
      .send(payload);
    expect(first.status).toBe(201);
    expect(first.headers['idempotency-replayed']).toBeUndefined();
    const retry = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'transport-two')
      .send(payload);
    expect(retry.status).toBe(first.status);
    expect(retry.text).toBe(first.text);
    expect(retry.headers['x-idempotency-key']).toBe('transport-two');
    expect(retry.headers['idempotency-replayed']).toBe('true');
  });

  it('returns a bounded 503 with Retry-After while a batch lease is held', async () => {
    heldGate = new Promise<void>((resolve) => {
      releaseHeld = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      signalHeld = resolve;
    });
    const heldPayload = {
      ...payload,
      deviceBatchId: 'held-batch',
      deviceId: 'held-device',
      batchSequence: 1,
      items: [
        {
          ...payload.items[0]!,
          queueItemId: 'held-item',
          idempotencyKey: 'held-item-key',
          reservedNumber: 1005,
        },
      ],
    };
    const first = request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'held-transport-one')
      .send(heldPayload);
    const firstResult = first.then((result) => result);
    await Promise.race([entered, new Promise<void>((resolve) => setTimeout(resolve, 100))]);
    try {
      const occupied = await request(app.getHttpServer())
        .post('/offline-sync/sync-batches')
        .set('Idempotency-Key', 'held-transport-two')
        .send(heldPayload);
      expect(occupied.status).toBe(503);
      expect(occupied.headers['retry-after']).toBe('1');
      expect(occupied.body).toMatchObject({
        errorCode: 'OFFLINE_SYNC:BATCH:in-progress',
        retryable: true,
      });
    } finally {
      releaseHeld?.();
      await firstResult;
    }
  }, 10_000);

  it('keeps the published 422 for unrelated transport-key reuse with changed body', async () => {
    const unrelated = (suffix: string) => ({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: `unrelated-${suffix}`,
      items: [
        {
          ...payload.items[0]!,
          queueItemId: `unrelated-queue-${suffix}`,
          localEntityId: `unrelated-local-${suffix}`,
          idempotencyKey: `unrelated-item-${suffix}`,
          payloadJson: { unrelated: suffix },
          payloadHash: `sha256:${createHash('sha256')
            .update(JSON.stringify({ unrelated: suffix }))
            .digest('hex')}`,
          reservedNumber: suffix === 'a' ? 1001 : 1002,
        },
      ],
    });
    const first = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'transport-unrelated')
      .send(unrelated('a'));
    expect(first.status).toBe(201);
    const changed = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'transport-unrelated')
      .send(unrelated('b'));
    expect(changed.status).toBe(422);
    expect(changed.body).toMatchObject({
      statusCode: 422,
      message: 'IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY',
    });
  });

  it('gives batch context conflict precedence over transport fingerprint reuse', async () => {
    const changed = {
      ...payload,
      items: [{ ...payload.items[0]!, localEntityId: 'changed-local' }],
    };
    const result = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'transport-one')
      .send(changed);
    expect(result.status).toBe(409);
    expect(result.body).toMatchObject({ statusCode: 409, retryable: false });
  });
});
