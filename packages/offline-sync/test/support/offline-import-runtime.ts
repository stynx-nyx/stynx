import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { RequestContextMutator } from '@stynx-nyx/core';
import { StynxDataModule } from '@stynx-nyx/data';
import { vi } from 'vitest';
import { StynxOfflineSyncModule } from '../../src/offline-sync.module.js';
import { OfflineSyncService } from '../../src/offline-sync.service.js';
import type { OfflineStorageFixture } from './offline-storage-fixture.js';
import { realOfflineHttpAuthentication } from './real-http-authentication.js';

export async function importedRuntime(
  value: OfflineStorageFixture,
  actor = 'authenticated-import-replay-actor',
) {
  // This consumer keeps its custom offline storage binding while installing
  // the actual platform auth schema and admission path in the same database.
  await value.admin.query('grant all on schema auth to stynx_owner with grant option');
  await value.admin.query('grant all on auth.tenants to stynx_owner with grant option');
  const bootstrap = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: value.postgres.connectionString('import-auth-bootstrap') },
          app: {
            connectionString: value.postgres.appConnectionString('import-auth-bootstrap-app'),
          },
          reader: {
            connectionString: value.postgres.appConnectionString(
              'import-auth-bootstrap-reader',
              'stynx_reader',
            ),
          },
        },
        migrations: { enabled: true },
        retry: false,
      }),
    ],
  }).compile();
  try {
    await bootstrap.init();
  } finally {
    await bootstrap.close();
  }
  await value.admin.query(
    "insert into tenancy.tenants(id,slug,name) values ($1,'import-runtime','Imported replay')",
    [value.tenants[0]],
  );
  const authentication = await realOfflineHttpAuthentication(value.postgres, value.tenants[0]);
  const appRole = value.admin.escapeIdentifier(value.options.appRole!);
  await value.admin.query(`grant usage on schema auth,tenancy to ${appRole}`);
  await value.admin.query(`grant select on all tables in schema auth,tenancy to ${appRole}`);
  const apply = vi.fn(async () => {
    throw new Error('Imported replay must not reapply domain effects');
  });
  const hash = vi.fn(async () => {
    throw new Error('Imported replay must not reinterpret historic payload hashes');
  });
  const append = vi.fn(async () => undefined);
  const moduleRef = await Test.createTestingModule({
    providers: authentication.providers,
    imports: [
      authentication.authModule,
      StynxDataModule.forRoot({
        appRoleName: value.options.appRole,
        connections: {
          owner: { connectionString: value.postgres.connectionString('import-runtime-owner') },
          app: {
            connectionString: value.postgres.appConnectionString(
              'import-runtime-app',
              value.options.appRole,
            ),
          },
          reader: {
            connectionString: value.postgres.appConnectionString(
              'import-runtime-reader',
              'stynx_reader',
            ),
          },
        },
        migrations: { enabled: false },
      }),
      StynxOfflineSyncModule.forRoot({
        policyResolver: { resolve: async () => ({ maxBatchItems: 20 }) },
        agentResolver: { resolve: async () => 'business-agent' },
        itemApplier: { apply },
        payloadHashPort: { hash },
        eventPort: { appendInTransaction: append, appendManyInTransaction: append },
      }),
    ],
  }).compile();
  const contexts = moduleRef.get(RequestContextMutator);
  const app = moduleRef.createNestApplication();
  await app.init();
  return {
    app,
    accessToken: authentication.accessToken,
    unprivilegedToken: authentication.unprivilegedToken,
    service: moduleRef.get(OfflineSyncService),
    apply,
    hash,
    append,
    run: <T>(operation: () => Promise<T>) =>
      contexts.runWithRequestContext(
        {
          requestId: randomUUID(),
          tenantId: value.tenants[0],
          actorId: actor,
          startedAt: new Date(),
        },
        operation,
      ),
  };
}
