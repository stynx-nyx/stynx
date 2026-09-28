import 'reflect-metadata';
import { RequestMethod, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { STYNX_PERMISSION_ROUTE } from '@stynx-nyx/auth';
import { STYNX_IDEMPOTENT_ROUTE } from '@stynx-nyx/idempotency';
import { describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { StynxOfflineSyncModule } from '../../src/offline-sync.module';
import type { StynxOfflineSyncModuleOptions } from '../../src/types';

// INV-OFFLINE-001; adoption-mode compatibility at module bootstrap.
type Route = { method: RequestMethod; path: string; permission: string; idempotent: boolean };
function routes(controllers: Array<Type<unknown>> | undefined): Route[] {
  return (controllers ?? []).flatMap((controller) => {
    const root = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
    return Object.getOwnPropertyNames(controller.prototype).flatMap((name) => {
      const handler = controller.prototype[name] as Function;
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (path === undefined || method === undefined) return [];
      return [
        {
          method,
          path: `/${root}/${path}`.replace(/\/+/g, '/'),
          permission: Reflect.getMetadata(STYNX_PERMISSION_ROUTE, handler) as string,
          idempotent: Reflect.getMetadata(STYNX_IDEMPOTENT_ROUTE, handler) !== undefined,
        },
      ];
    });
  });
}
const policyResolver = { resolve: async () => ({ reservationTtlMs: 60_000, maxBatchItems: 150 }) };
const options = { policyResolver } as StynxOfflineSyncModuleOptions;
const original = [
  {
    method: RequestMethod.POST,
    path: '/offline-sync/numbering-reservations',
    permission: 'offline-sync:numbering:reserve',
  },
  {
    method: RequestMethod.POST,
    path: '/offline-sync/numbering-reservations/:id/cancel',
    permission: 'offline-sync:numbering:cancel',
  },
  {
    method: RequestMethod.POST,
    path: '/offline-sync/sync-batches',
    permission: 'offline-sync:batches:submit',
  },
  {
    method: RequestMethod.POST,
    path: '/offline-sync/conflicts/:id/resolve',
    permission: 'offline-sync:conflicts:resolve',
  },
];

describe('OFS E6 and CTG9 controller bootstrap selection', () => {
  it('keeps all four method/path/permission pairs in either mode', () => {
    const e6 = routes(StynxOfflineSyncModule.forRoot().controllers);
    const ctg9 = routes(StynxOfflineSyncModule.forRoot(options).controllers);
    for (const expected of original) {
      expect(e6).toContainEqual(expect.objectContaining(expected));
      expect(ctg9).toContainEqual(expect.objectContaining(expected));
    }
  });

  it('uses published @Idempotent on E6 batch and an OFS ledger only in CTG9 mode', () => {
    const e6Batch = routes(StynxOfflineSyncModule.forRoot().controllers).find(
      (route) => route.path === '/offline-sync/sync-batches',
    );
    const ctg9Batch = routes(StynxOfflineSyncModule.forRoot(options).controllers).find(
      (route) => route.path === '/offline-sync/sync-batches',
    );
    expect(e6Batch?.idempotent).toBe(true);
    expect(ctg9Batch?.idempotent).toBe(false);
    for (const route of routes(StynxOfflineSyncModule.forRoot(options).controllers).filter(
      (route) =>
        original.some(
          (expected) => expected.path === route.path && route.path !== '/offline-sync/sync-batches',
        ),
    )) {
      expect(route.idempotent).toBe(true);
    }
  });

  it('treats policyResolver: undefined as E6 during controller selection', () => {
    const e6 = routes(
      StynxOfflineSyncModule.forRoot({ policyResolver: undefined } as StynxOfflineSyncModuleOptions)
        .controllers,
    );
    expect(e6.find((route) => route.path === '/offline-sync/sync-batches')?.idempotent).toBe(true);
  });

  it.each([
    'itemApplier',
    'eventPort',
    'agentResolver',
    'legacyItemIdentityResolver',
    'legacyIdempotencyStore',
    'handoffPort',
    'concurrencyDetector',
    'conflictResolver',
  ])('rejects CTG9-only %s without a policy resolver at bootstrap', async (port) => {
    const invalid = { [port]: {}, mountControllers: false } as StynxOfflineSyncModuleOptions;
    const error = await bootstrap(invalid).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).constructor.name).toBe('OfflineSyncConfigurationError');
    expect(error).toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect((error as Error).message).toContain(port);
  });

  it('rejects a resolver paired with an E6-only custom store before serving requests', async () => {
    const e6OnlyStore = {
      reserveNumbering: vi.fn(),
      cancelNumberingReservation: vi.fn(),
      submitSyncBatch: vi.fn(),
      openConflict: vi.fn(),
      resolveConflict: vi.fn(),
    };
    const error = await bootstrap({
      ...options,
      store: e6OnlyStore,
      mountControllers: false,
    } as StynxOfflineSyncModuleOptions).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).constructor.name).toBe('OfflineSyncConfigurationError');
    expect(error).toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect((error as Error).message).toContain('store');
  });

  it('rejects an item applier without its transactional event port at bootstrap', async () => {
    const error = await bootstrap({
      ...options,
      itemApplier: { apply: vi.fn() },
      mountControllers: false,
    } as unknown as StynxOfflineSyncModuleOptions).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).constructor.name).toBe('OfflineSyncConfigurationError');
    expect(error).toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    expect((error as Error).message).toContain('eventPort');
  });

  it('keeps service-only behavior available in both bootstrap modes', () => {
    expect(routes(StynxOfflineSyncModule.forRoot({ mountControllers: false }).controllers)).toEqual(
      [],
    );
    expect(
      routes(StynxOfflineSyncModule.forRoot({ ...options, mountControllers: false }).controllers),
    ).toEqual([]);
  });
});

async function bootstrap(options: StynxOfflineSyncModuleOptions): Promise<void> {
  const moduleRef = await Test.createTestingModule({
    imports: [StynxOfflineSyncModule.forRoot(options)],
  }).compile();
  try {
    await moduleRef.init();
  } finally {
    await moduleRef.close();
  }
}
