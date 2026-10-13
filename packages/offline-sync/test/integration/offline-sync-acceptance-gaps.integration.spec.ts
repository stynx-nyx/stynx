import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { RequestContextMutator } from '@stynx-nyx/core';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { OutboxService } from '@stynx-nyx/outbox';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import {
  GAP_AT,
  GAP_TENANT_A,
  GAP_TENANT_B,
  registerOfflineGapContracts,
} from '../support/offline-sync-acceptance-gaps';

// INV-OFFLINE-001: real SQL, direct restricted-role login, tenant/actor context on every connection.
describe('Offline acceptance gap contracts through real PostgreSQL', () => {
  let pg: PostgresTestDatabase;
  let moduleRef: TestingModule;
  beforeAll(async () => {
    pg = await createPostgresTestDatabase('stynx_ofs_161_gaps', { useTemplate: false });
    await pg.ensureRoleLogin('stynx_app');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: pg.connectionString('gaps-owner') },
            app: { connectionString: pg.appConnectionString('gaps-app'), max: 10 },
            reader: { connectionString: pg.connectionString('gaps-reader') },
          },
          migrations: { enabled: true },
        }),
      ],
    }).compile();
    await moduleRef.init();
    const admin = await pg.connectAsAdmin();
    try {
      const directory = resolve(__dirname, '../../migrations');
      for (const name of (await readdir(directory))
        .filter((name) => /^\d{4}.*\.sql$/u.test(name))
        .sort())
        await admin.query(await readFile(resolve(directory, name), 'utf8'));
      await admin.query(
        `insert into tenancy.tenants(id,slug,name) values ($1,'gaps-a','Gaps A'),($2,'gaps-b','Gaps B')`,
        [GAP_TENANT_A, GAP_TENANT_B],
      );
      await admin.query(
        `insert into offline.numbering_ranges(id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status) values ('10000000-0000-4000-8000-0000000000d1',$1,'org-a','citation','C',1,100,1,'active')`,
        [GAP_TENANT_A],
      );
    } finally {
      await admin.end();
    }
  }, 60_000);
  afterAll(async () => {
    await moduleRef?.close();
    await pg?.dispose();
  }, 60_000);
  registerOfflineGapContracts(() => {
    let clock = Date.parse(GAP_AT);
    return {
      service: (options = {}, tenantId = GAP_TENANT_A) =>
        new OfflineSyncService(
          new PostgresOfflineSyncStore(moduleRef),
          { current: () => ({ tenantId, actorId: 'authenticated-audit-actor' }) },
          {
            now: () => new Date(clock).toISOString(),
            policyResolver: { resolve: async () => ({ reservationTtlMs: 60_000 }) },
            ...options,
          },
        ),
      run: (tenantId, operation) =>
        moduleRef.get(RequestContextMutator).runWithRequestContext(
          {
            requestId: 'gaps-contract',
            tenantId,
            actorId: 'authenticated-audit-actor',
            startedAt: new Date(clock),
          },
          operation,
        ),
      appendResolution: async (trx, event) => {
        await new OutboxService(moduleRef.get(Database), {
          dispatchableEntities: [],
        }).appendInTransaction(trx, event);
      },
      tick: () => {
        clock += 1000;
      },
    };
  });
});
