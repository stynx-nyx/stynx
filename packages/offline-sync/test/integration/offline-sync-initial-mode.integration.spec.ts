import { registerOfflineMinorRuntimeContracts } from '../support/minor-runtime-contract.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store.js';
import { canonicalOfflineSyncPayloadHash } from '../../src/payload-integrity.js';
import { batchContextFingerprint } from '../../src/transport.js';
import type { CTG9SubmitSyncBatchInput, StynxOfflineSyncModuleOptions } from '../../src/types.js';

const tenantA = '00000000-0000-4000-8000-0000000000a9';
const tenantB = '00000000-0000-4000-8000-0000000000b9';
const at = '2026-10-10T12:00:00.000Z';
const actorId = 'authenticated-actor';
const input = (id: string, keyed = true): CTG9SubmitSyncBatchInput => ({
  orgUnitId: 'org-a',
  deviceId: 'device-a',
  deviceBatchId: id,
  items: [
    {
      queueItemId: id,
      entityType: 'citation',
      localEntityId: id,
      ...(keyed ? { idempotencyKey: `key-${id}` } : {}),
      payloadJson: { value: 7 },
      payloadHash: canonicalOfflineSyncPayloadHash({ value: 7 }),
      createdLocallyAt: at,
    },
  ],
});
const oldOpen = input('legacy-open');
const oldHash = batchContextFingerprint(oldOpen, actorId);
const oldBytes = Buffer.from('{"historical":"ACK bytes preserved exactly"}\n');

describe('UPS-OFS-09 PostgreSQL initial-mode persistence and populated 0005 upgrade', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  let oldRows: Record<string, unknown>[];
  const apply = vi.fn(async () => {
    throw new Error('retryable interruption');
  });
  const append = vi.fn(async () => undefined);
  const hash = vi.fn(async (value: { payloadJson: Record<string, unknown> }) =>
    canonicalOfflineSyncPayloadHash(value.payloadJson),
  );
  const service = (initialQueueStatus?: 'received' | 'pending') =>
    new OfflineSyncService(
      new PostgresOfflineSyncStore(moduleRef),
      { current: () => ({ tenantId: tenantA, actorId }) },
      {
        now: () => at,
        initialQueueStatus,
        policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000, maxBatchItems: 20 }) },
        itemApplier: { apply },
        payloadHashPort: { hash },
        eventPort: { appendInTransaction: append, appendManyInTransaction: async () => undefined },
      } as StynxOfflineSyncModuleOptions,
    );
  const run = <T>(tenantId: string, operation: () => Promise<T>) =>
    moduleRef
      .get(RequestContextMutator)
      .runWithRequestContext(
        { requestId: `initial-mode-${Math.random()}`, tenantId, actorId, startedAt: new Date(at) },
        operation,
      );
  const submit = (mode: 'received' | 'pending' | undefined, body: CTG9SubmitSyncBatchInput) =>
    run(tenantA, () => service(mode).submitSyncBatch(body));
  const rows = (tenantId: string, text: string, values: unknown[] = []) =>
    run(tenantId, () => moduleRef.get(Database).tx((trx) => trx.query(text, values))).then(
      (result) => result.rows,
    );

  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_ofs_initial_mode', { useTemplate: false });
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: pg.connectionString('initial-owner') },
            app: { connectionString: pg.appConnectionString('initial-app'), max: 10 },
            reader: { connectionString: pg.connectionString('initial-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    await pg.ensureRoleLogin('stynx_app');
    const admin = await pg.connectAsAdmin();
    try {
      for (const migration of [
        '0001_offline_sync.sql',
        '0002_durable_sync.sql',
        '0003_reservation_idempotency.sql',
        '0004_pending_state_and_conflict_actions.sql',
      ])
        await admin.query(
          await readFile(resolve(__dirname, '../../migrations', migration), 'utf8'),
        );
      await admin.query(
        `insert into tenancy.tenants(id,slug,name) values ($1,'initial-a','Initial A'),($2,'initial-b','Initial B')`,
        [tenantA, tenantB],
      );
      await admin.query(
        `insert into offline.sync_batches(tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status,response_status,response_body_bytes,response_headers) values
        ($1,'device-a','legacy-open','org-a',$3,$4,'["key-legacy-open"]','open',null,null,'{}'),
        ($2,'device-a','legacy-closed','org-a',$3,'historical-context','[]','closed',201,$5,'{"x-historical":"exact"}')`,
        [tenantA, tenantB, actorId, oldHash, oldBytes],
      );
      await admin.query(
        `insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values ('10000000-0000-4000-8000-0000000000a9',$1,'org-a','citation','C',1,200,1,'active')`,
        [tenantA],
      );
      oldRows = (
        await admin.query(
          `select to_jsonb(b)::text as bytes from offline.sync_batches b where device_batch_id in ('legacy-open','legacy-closed') order by tenant_id,device_batch_id`,
        )
      ).rows;
      await admin.query(
        await readFile(
          resolve(__dirname, '../../migrations/0005_initial_queue_status.sql'),
          'utf8',
        ),
      );
    } finally {
      await admin.end();
    }
  }, 60_000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60_000);

  registerOfflineMinorRuntimeContracts(() => ({
    service: (options: Partial<StynxOfflineSyncModuleOptions> = {}, tenantId = tenantA) =>
      new OfflineSyncService(
        new PostgresOfflineSyncStore(moduleRef),
        { current: () => ({ tenantId, actorId }) },
        {
          now: () => at,
          policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
          ...options,
        },
      ),
    run,
    assertClosedReplay: (actual, original) => expect(actual).toEqual(original),
  }));

  it('defaults populated legacy rows to received without rewriting contexts or archived ACK bytes, and rejects unsupported mode at storage', async () => {
    const admin = await pg.connectAsAdmin();
    try {
      const preserved = (
        await admin.query(
          "select (to_jsonb(b)-'initial_queue_status')::text as bytes from offline.sync_batches b where device_batch_id in ('legacy-open','legacy-closed') order by tenant_id,device_batch_id",
        )
      ).rows;
      expect(preserved).toEqual(oldRows);
      expect(
        (
          await admin.query(
            `select initial_queue_status from offline.sync_batches where device_batch_id in ('legacy-open','legacy-closed') order by tenant_id`,
          )
        ).rows,
      ).toEqual([{ initial_queue_status: 'received' }, { initial_queue_status: 'received' }]);
      expect(
        (
          await admin.query(
            "select context_hash,response_body_bytes,response_headers from offline.sync_batches where device_batch_id='legacy-closed'",
          )
        ).rows,
      ).toEqual([
        {
          context_hash: 'historical-context',
          response_body_bytes: oldBytes,
          response_headers: { 'x-historical': 'exact' },
        },
      ]);
      await expect(
        admin.query(
          "update offline.sync_batches set initial_queue_status='applied' where device_batch_id='legacy-open'",
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await admin.end();
    }
    expect(
      await rows(
        tenantA,
        "select device_batch_id from offline.sync_batches where device_batch_id='legacy-closed'",
      ),
    ).toEqual([]);
    expect(
      await rows(
        tenantB,
        "select device_batch_id from offline.sync_batches where device_batch_id='legacy-open'",
      ),
    ).toEqual([]);
  });

  it('resumes a pre-upgrade open batch in received mode even when the module now opts into pending', async () => {
    const result = await submit('pending', oldOpen);
    expect(result.receipt).toMatchObject({ status: 'open', items: [{ status: 'received' }] });
    expect(
      await rows(
        tenantA,
        "select initial_queue_status,context_hash from offline.sync_batches where device_batch_id='legacy-open'",
      ),
    ).toEqual([{ initial_queue_status: 'received', context_hash: oldHash }]);
  });

  it.each(['received', 'pending'] as const)(
    'retains %s through failed processing, opposite-option lease takeover, success and exact closed replay',
    async (mode) => {
      const body = input(`resume-${mode}`);
      const before = apply.mock.calls.length;
      const beforeEvents = append.mock.calls.length;
      expect((await submit(mode, body)).receipt).toMatchObject({
        status: 'open',
        items: [{ status: mode }],
      });
      expect(
        await rows(
          tenantA,
          'select initial_queue_status from offline.sync_batches where device_batch_id=$1',
          [body.deviceBatchId],
        ),
      ).toEqual([{ initial_queue_status: mode }]);
      await rows(
        tenantA,
        "update offline.sync_batches set lease_expires_at=clock_timestamp()-interval '1 second' where device_batch_id=$1",
        [body.deviceBatchId],
      );
      const opposite = mode === 'pending' ? 'received' : 'pending';
      expect((await submit(opposite, body)).receipt).toMatchObject({
        status: 'open',
        items: [{ status: mode }],
      });
      expect(apply).toHaveBeenCalledTimes(before + 2);
      apply.mockImplementationOnce(async () => ({ serverEntityId: 'server-once' }) as never);
      const completed = await submit(opposite, body);
      expect(completed.receipt).toMatchObject({ status: 'closed', items: [{ status: 'applied' }] });
      expect(append).toHaveBeenCalledTimes(beforeEvents + 1);
      const stored = await rows(
        tenantA,
        'select response_body_bytes,context_hash,initial_queue_status from offline.sync_batches where device_batch_id=$1',
        [body.deviceBatchId],
      );
      const hashCalls = hash.mock.calls.length;
      const replay = await submit(mode, body);
      expect(replay).toEqual(completed);
      expect(hash).toHaveBeenCalledTimes(hashCalls);
      expect(apply).toHaveBeenCalledTimes(before + 3);
      expect(
        await rows(
          tenantA,
          'select response_body_bytes,context_hash,initial_queue_status from offline.sync_batches where device_batch_id=$1',
          [body.deviceBatchId],
        ),
      ).toEqual(stored);
    },
  );

  it('persists the admitted winner when concurrent creators configure opposite initial modes', async () => {
    let release!: () => void;
    let entered!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    apply.mockImplementationOnce(async () => {
      entered();
      await blocked;
      throw new Error('concurrent interrupted apply');
    });
    const before = apply.mock.calls.length;
    const body = input('opposite-concurrent');
    const winner = submit('pending', body);
    await started;
    expect(
      await rows(
        tenantA,
        'select initial_queue_status from offline.sync_batches where device_batch_id=$1',
        [body.deviceBatchId],
      ),
    ).toEqual([{ initial_queue_status: 'pending' }]);
    const loser = submit('received', body);
    release();
    const results = await Promise.all([winner, loser]);
    expect(results.map((result) => result.receipt.items[0]?.status)).toEqual([
      'pending',
      'pending',
    ]);
    expect(apply.mock.calls.length - before).toBeGreaterThanOrEqual(1);
    expect(apply.mock.calls.length - before).toBeLessThanOrEqual(2);
    expect(
      await rows(
        tenantA,
        'select initial_queue_status from offline.sync_batches where device_batch_id=$1',
        [body.deviceBatchId],
      ),
    ).toEqual([{ initial_queue_status: 'pending' }]);
    expect(
      await rows(
        tenantA,
        'select status from offline.sync_item_receipts where idempotency_key=$1',
        ['key-opposite-concurrent'],
      ),
    ).toEqual([{ status: 'pending' }]);
  });

  it('keeps unkeyed CTG9 items received and defaults omitted mode without applying legacy items', async () => {
    const before = apply.mock.calls.length;
    expect((await submit(undefined, input('default'))).receipt.items[0]).toMatchObject({
      status: 'received',
    });
    expect((await submit('pending', input('unkeyed', false))).receipt.items[0]).toMatchObject({
      status: 'received',
      errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED',
    });
    expect(apply).toHaveBeenCalledTimes(before + 1);
  });
  it('names required migration 0005 when only the captured initial-mode column is absent and writes no queue/effect', async () => {
    const old = await createPostgresTestDatabase('stynx_ofs_missing_initial_mode', {
      useTemplate: false,
    });
    let oldModule: TestingModule | undefined;
    try {
      oldModule = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: old.connectionString('missing-mode-owner') },
              app: { connectionString: old.appConnectionString('missing-mode-app') },
              reader: { connectionString: old.connectionString('missing-mode-reader') },
            },
            migrations: { enabled: true },
          }),
        ],
      }).compile();
      await oldModule.init();
      await old.ensureRoleLogin('stynx_app');
      const admin = await old.connectAsAdmin();
      try {
        for (const name of [
          '0001_offline_sync.sql',
          '0002_durable_sync.sql',
          '0003_reservation_idempotency.sql',
          '0004_pending_state_and_conflict_actions.sql',
        ])
          await admin.query(await readFile(resolve(__dirname, '../../migrations', name), 'utf8'));
        await admin.query(
          "insert into tenancy.tenants(id,slug,name) values($1,'missing-mode','Missing mode')",
          [tenantA],
        );
      } finally {
        await admin.end();
      }
      const effect = vi.fn(async () => ({ serverEntityId: 'must-not-apply' }));
      const appendEvent = vi.fn(async () => undefined);
      const missing = new OfflineSyncService(
        new PostgresOfflineSyncStore(oldModule),
        { current: () => ({ tenantId: tenantA, actorId }) },
        {
          initialQueueStatus: 'pending',
          policyResolver: { resolve: async () => ({}) },
          itemApplier: { apply: effect },
          eventPort: {
            appendInTransaction: appendEvent,
            appendManyInTransaction: async () => undefined,
          },
        },
      );
      await expect(
        oldModule
          .get(RequestContextMutator)
          .runWithRequestContext(
            { requestId: 'missing005', tenantId: tenantA, actorId, startedAt: new Date(at) },
            () => missing.submitSyncBatch(input('missing005')),
          ),
      ).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_UPGRADE_REQUIRED',
        message: 'Offline-sync migration 0005 is required.',
      });
      expect(effect).not.toHaveBeenCalled();
      expect(appendEvent).not.toHaveBeenCalled();
      const verify = await old.connectAsAdmin();
      try {
        for (const table of ['sync_batches', 'sync_queue_items', 'sync_item_receipts'])
          expect(
            (await verify.query(`select count(*)::int as count from offline.${table}`)).rows,
          ).toEqual([{ count: 0 }]);
      } finally {
        await verify.end();
      }
    } finally {
      await oldModule?.close();
      await old.dispose();
    }
  }, 60_000);
});
