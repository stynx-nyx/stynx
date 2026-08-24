import { describe, expect, it } from 'vitest';
import { OfflineFirstMobileRuntime } from '../src/runtime';
import {
  FixedMobileClock,
  InMemoryEncryptedMobileStore,
  NodeMobileCryptoPort,
  SandboxMobileBackendClient,
  SandboxStynxMobileSessionPort,
  SequentialMobileIdPort,
  SimulatedMobilePrinterPort,
} from '../src/testing';
import type {
  CreateMobileDraftInput,
  MobileNormativePackageSnapshot,
  MobileSessionContext,
  MobileSyncQueueItem,
} from '../src/types';

interface Harness {
  readonly runtime: OfflineFirstMobileRuntime;
  readonly store: InMemoryEncryptedMobileStore;
  readonly backend: SandboxMobileBackendClient;
  readonly clock: FixedMobileClock;
  readonly ids: SequentialMobileIdPort;
}

const baseSession: MobileSessionContext = {
  tenantId: '00000000-0000-4000-8000-000000000001',
  orgUnitId: '00000000-0000-4000-8000-0000000000aa',
  agentId: 'agent-001',
  deviceId: 'device-001',
  shiftId: 'shift-001',
  appVersion: '0.1.0-sandbox',
  roles: ['field-agent'],
};

const basePackage: MobileNormativePackageSnapshot = {
  packageId: 'pkg-2026-05',
  packageVersion: '2026.05',
  manifestHash: 'sha256:mobile-package-manifest',
  validUntil: '2026-06-30T23:59:59.000Z',
  status: 'published',
};

function createHarness(
  options: {
    readonly packageSnapshot?: MobileNormativePackageSnapshot;
    readonly conflictReservedNumbers?: readonly number[];
    readonly withPrinter?: boolean;
  } = {},
): Harness {
  const store = new InMemoryEncryptedMobileStore();
  const backend = new SandboxMobileBackendClient(
    options.packageSnapshot,
    options.conflictReservedNumbers ?? [],
  );
  const clock = new FixedMobileClock();
  const ids = new SequentialMobileIdPort();
  return {
    store,
    backend,
    clock,
    ids,
    runtime: new OfflineFirstMobileRuntime(
      store,
      backend,
      new NodeMobileCryptoPort(),
      clock,
      ids,
      options.withPrinter === false ? undefined : new SimulatedMobilePrinterPort(clock, ids),
      { requiredRoles: ['field-agent'] },
    ),
  };
}

async function bootstrap(
  runtime: OfflineFirstMobileRuntime,
  session: MobileSessionContext = baseSession,
): Promise<void> {
  await runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(session), {
    homologated: true,
    remoteWipeVersion: 1,
    secureHardwareBacked: true,
    printerStatus: 'paired',
    networkStatus: 'limited',
  });
}

function draftInput(clock: FixedMobileClock, reservedNumber?: number): CreateMobileDraftInput {
  return {
    entityType: 'ait',
    ...(reservedNumber === undefined ? {} : { reservedNumber }),
    payload: { plate: 'QWE4A21', framing_code: '605-03' },
    observedAt: clock.now(),
    location: {
      latitude: -3.119,
      longitude: -60.0217,
      accuracyMeters: 8,
      capturedAt: clock.now(),
      source: 'gps',
    },
  };
}

describe('Offline-first mobile runtime edge cases', () => {
  it('rejects sessions missing required roles and insecure device posture', async () => {
    const { runtime } = createHarness();

    await expect(
      bootstrap(runtime, { ...baseSession, roles: ['field-supervisor'] }),
    ).rejects.toThrow(/field-agent/);
    await expect(
      runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), {
        homologated: false,
        remoteWipeVersion: 1,
        secureHardwareBacked: true,
        printerStatus: 'paired',
        networkStatus: 'online',
      }),
    ).rejects.toThrow(/Device posture/);
    await expect(
      runtime.bootstrapFromStynxSession(new SandboxStynxMobileSessionPort(), {
        homologated: true,
        remoteWipeVersion: 1,
        secureHardwareBacked: false,
        printerStatus: 'paired',
        networkStatus: 'online',
      }),
    ).rejects.toThrow(/Device posture/);
  });

  it('rejects expired or retired normative packages before local installation', async () => {
    const expired = createHarness({
      packageSnapshot: {
        ...basePackage,
        packageId: 'pkg-expired',
        validUntil: '2026-05-20T11:59:59.000Z',
      },
    });
    await bootstrap(expired.runtime);
    await expect(expired.runtime.installPublishedNormativePackage()).rejects.toThrow(/expired/);

    const retired = createHarness({
      packageSnapshot: { ...basePackage, packageId: 'pkg-retired', status: 'retired' },
    });
    await bootstrap(retired.runtime);
    await expect(retired.runtime.installPublishedNormativePackage()).rejects.toThrow(
      /not published/,
    );
  });

  it('requires a usable numbering reservation and exact requested number', async () => {
    const { runtime, clock } = createHarness();

    await bootstrap(runtime);
    await runtime.installPublishedNormativePackage();
    await expect(runtime.createDraft(draftInput(clock))).rejects.toThrow(
      /No usable reserved numbering/,
    );

    await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    await expect(runtime.createDraft(draftInput(clock, 1001))).rejects.toThrow(
      /No usable reserved numbering/,
    );
    await expect(runtime.createDraft(draftInput(clock, 1000))).resolves.toMatchObject({
      reservedNumber: 1000,
    });
    await expect(runtime.createDraft(draftInput(clock))).rejects.toThrow(
      /No usable reserved numbering/,
    );
  });

  it('rejects invalid evidence hashes, unknown acts and unsupported print states', async () => {
    const { runtime, clock } = createHarness({ withPrinter: false });

    await bootstrap(runtime);
    await runtime.installPublishedNormativePackage();
    await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const draft = await runtime.createDraft(draftInput(clock));

    await expect(
      runtime.attachEvidence(draft.localId, {
        localEvidenceId: 'evidence-invalid',
        hashAlgorithm: 'sha256',
        hashValue: 'md5:bad',
        mediaType: 'image/jpeg',
        capturedAt: clock.now(),
      }),
    ).rejects.toThrow(/sha256 hash/);
    await expect(
      runtime.attachEvidence('missing-act', {
        localEvidenceId: 'evidence-missing',
        hashAlgorithm: 'sha256',
        hashValue: 'sha256:valid',
        mediaType: 'image/jpeg',
        capturedAt: clock.now(),
      }),
    ).rejects.toThrow(/missing-act was not found/);
    await expect(runtime.printReceipt(draft.localId)).rejects.toThrow(/No mobile printer/);
  });

  it('handles empty sync queues and rejects invalid conflict resolution states', async () => {
    const { runtime, store, clock } = createHarness();

    await bootstrap(runtime);
    await runtime.installPublishedNormativePackage();
    await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    await expect(runtime.submitPendingQueue()).resolves.toEqual({
      batchId: 'empty',
      acceptedItems: 0,
      conflicts: [],
    });
    await expect(runtime.resolveSimpleConflict('missing-item', 'device-wins')).rejects.toThrow(
      /missing-item was not found/,
    );

    const draft = await runtime.createDraft(draftInput(clock));
    await runtime.attachEvidence(draft.localId, {
      localEvidenceId: 'evidence-valid',
      hashAlgorithm: 'sha256',
      hashValue: 'sha256:valid',
      mediaType: 'image/jpeg',
      capturedAt: clock.now(),
    });
    await runtime.finalizeOffline(draft.localId);
    const queueItem = await runtime.enqueue(draft.localId);
    await runtime.submitPendingQueue();

    await expect(
      runtime.resolveSimpleConflict(queueItem.queueItemId, 'manual-review'),
    ).rejects.toThrow(/expected conflict/);
    expect(
      (await store.get<MobileSyncQueueItem>('sync-queue', queueItem.queueItemId))?.status,
    ).toBe('received');
  });

  it('does not consume a reservation belonging to another entity type', async () => {
    const { runtime, clock } = createHarness();
    await bootstrap(runtime);
    await runtime.installPublishedNormativePackage();
    await runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });

    await expect(
      runtime.createDraft({ ...draftInput(clock), entityType: 'crash-record' }),
    ).rejects.toThrow(/No usable reserved numbering/);
  });

  it('returns sent items to pending when batch transport fails so the same draft can retry', async () => {
    const harness = createHarness();
    await bootstrap(harness.runtime);
    await harness.runtime.installPublishedNormativePackage();
    await harness.runtime.reserveNumbering({ entityType: 'ait', requestedSize: 1 });
    const draft = await harness.runtime.createDraft(draftInput(harness.clock));
    await harness.runtime.attachEvidence(draft.localId, {
      localEvidenceId: 'evidence-retry',
      hashAlgorithm: 'sha256',
      hashValue: 'sha256:retry',
      mediaType: 'image/jpeg',
      capturedAt: harness.clock.now(),
    });
    await harness.runtime.finalizeOffline(draft.localId);
    const queueItem = await harness.runtime.enqueue(draft.localId);
    const originalSubmit = harness.backend.submitSyncBatch.bind(harness.backend);
    harness.backend.submitSyncBatch = async () => {
      throw new Error('offline');
    };

    await expect(harness.runtime.submitPendingQueue()).rejects.toThrow(/offline/);
    expect(
      (await harness.store.get<MobileSyncQueueItem>('sync-queue', queueItem.queueItemId))?.status,
    ).toBe('pending');

    harness.backend.submitSyncBatch = originalSubmit;
    await expect(harness.runtime.submitPendingQueue()).resolves.toMatchObject({ acceptedItems: 1 });
  });
});
