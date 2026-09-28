import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { IdempotencyInterceptor, type IdempotencyStoredEntry } from '@stynx-nyx/idempotency';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { StynxOfflineSyncModule } from '../../src/offline-sync.module';

// INV-OFFLINE-001: no policy resolver preserves E6 HTTP and rejects body-selected mode.
const payload = {
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  deviceBatchId: 'legacy-batch',
  batchSequence: 9,
  mode: 'ctg9',
  items: [
    {
      queueItemId: 'legacy-queue',
      entityType: 'citation',
      localEntityId: 'legacy-local',
      idempotencyKey: 'legacy-item-key',
      payloadHash: `sha256:${'a'.repeat(64)}`,
      payloadJson: {},
      createdLocallyAt: '2026-09-28T12:00:00.000Z',
    },
  ],
};

describe('E6 batch HTTP remains active without a policy resolver', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxOfflineSyncModule.inMemory({
          context: {
            current: () => ({
              tenantId: '00000000-0000-4000-8000-0000000000a1',
              actorId: 'actor-a',
            }),
          },
        }),
      ],
    })
      .overrideGuard(StynxAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    const entries = new Map<string, IdempotencyStoredEntry>();
    const locks = new Set<string>();
    app.useGlobalInterceptors(
      new IdempotencyInterceptor(new Reflector(), {}, undefined, {
        get: async ({ compositeKey }) => entries.get(compositeKey) ?? null,
        set: async ({ compositeKey }, entry) => {
          entries.set(compositeKey, entry);
        },
        acquireLock: async ({ compositeKey }) => {
          if (locks.has(compositeKey)) return false;
          locks.add(compositeKey);
          return true;
        },
        releaseLock: async ({ compositeKey }) => {
          locks.delete(compositeKey);
        },
        isLocked: async ({ compositeKey }) => locks.has(compositeKey),
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('keeps missing-key 400, published replay headers, and payload-hash dedup despite body mode fields', async () => {
    const missing = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .send(payload);
    expect(missing.status).toBe(400);
    const first = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'legacy-transport')
      .send(payload);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ duplicateItems: 0 });
    const replay = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'legacy-transport')
      .send(payload);
    expect(replay.status).toBe(first.status);
    expect(replay.text).toBe(first.text);
    expect(replay.headers['x-idempotency-key']).toBe('legacy-transport');
    expect(replay.headers['idempotency-replayed']).toBe('true');
    const transportReuse = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'legacy-transport')
      .send({ ...payload, deviceBatchId: 'changed-body' });
    expect(transportReuse.status).toBe(422);
    expect(transportReuse.body).toMatchObject({
      statusCode: 422,
      message: 'IDEMPOTENT_KEY_REUSE_DIFFERENT_BODY',
    });
    const distinct = await request(app.getHttpServer())
      .post('/offline-sync/sync-batches')
      .set('Idempotency-Key', 'legacy-other-transport')
      .send({
        ...payload,
        deviceBatchId: 'legacy-second',
        items: [
          {
            ...payload.items[0]!,
            queueItemId: 'legacy-other-queue',
            idempotencyKey: 'legacy-other-item',
          },
        ],
      });
    expect(distinct.status).toBe(201);
    expect(distinct.body).toMatchObject({ duplicateItems: 1 });
  });
});
