import { describe } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import {
  GAP_AT,
  GAP_TENANT_A,
  registerOfflineGapContracts,
} from '../support/offline-sync-acceptance-gaps.js';

describe('Offline acceptance gap contracts through the memory store', () => {
  registerOfflineGapContracts(() => {
    const store = new InMemoryOfflineSyncStore();
    store.seedNumberingRange({
      id: '10000000-0000-4000-8000-0000000000d1',
      tenantId: GAP_TENANT_A,
      orgUnitId: 'org-a',
      entityType: 'citation',
      series: 'C',
      startNumber: 1,
      endNumber: 100,
      nextNumber: 1,
      status: 'active',
    });
    let clock = Date.parse(GAP_AT);
    return {
      service: (options = {}, tenantId = GAP_TENANT_A) =>
        new OfflineSyncService(
          store,
          { current: () => ({ tenantId, actorId: 'authenticated-audit-actor' }) },
          {
            now: () => new Date(clock).toISOString(),
            policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
            ...options,
          },
        ),
      run: async (_tenantId, operation) => operation(),
      tick: () => {
        clock += 1000;
      },
    };
  });
});
