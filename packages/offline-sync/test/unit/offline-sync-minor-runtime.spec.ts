import { describe, expect } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import {
  registerOfflineMinorRuntimeContracts,
  MINOR_TENANT_A,
} from '../support/minor-runtime-contract.js';
import type { StynxOfflineSyncModuleOptions } from '../../src/types.js';

describe('In-memory minor runtime contracts', () => {
  const store = new InMemoryOfflineSyncStore();
  store.seedNumberingRange({
    id: '10000000-0000-4000-8000-0000000000a9',
    tenantId: MINOR_TENANT_A,
    orgUnitId: 'org-a',
    entityType: 'citation',
    series: 'C',
    startNumber: 1,
    endNumber: 200,
    nextNumber: 1,
    status: 'active',
  });
  registerOfflineMinorRuntimeContracts(() => ({
    service: (options: Partial<StynxOfflineSyncModuleOptions> = {}, tenantId = MINOR_TENANT_A) =>
      new OfflineSyncService(
        store,
        { current: () => ({ tenantId, actorId: 'authenticated-actor' }) },
        {
          now: () => '2026-10-10T12:00:00.000Z',
          policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
          ...options,
        },
      ),
    run: async (_tenantId, operation) => operation(),
    assertClosedReplay: (actual, original) => expect(actual).toEqual(original),
  }));
});
