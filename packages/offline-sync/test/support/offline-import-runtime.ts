import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { RequestContextMutator } from '@stynx-nyx/core';
import { StynxDataModule } from '@stynx-nyx/data';
import type { Request, Response, NextFunction } from 'express';
import { vi } from 'vitest';
import { StynxOfflineSyncModule } from '../../src/offline-sync.module';
import { OfflineSyncService } from '../../src/offline-sync.service';
import type { OfflineStorageFixture } from './offline-storage-fixture';

export async function importedRuntime(
  value: OfflineStorageFixture,
  actor = 'authenticated-import-replay-actor',
) {
  const apply = vi.fn(async () => {
    throw new Error('Imported replay must not reapply domain effects');
  });
  const hash = vi.fn(async () => {
    throw new Error('Imported replay must not reinterpret historic payload hashes');
  });
  const append = vi.fn(async () => undefined);
  const moduleRef = await Test.createTestingModule({
    imports: [
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
              value.options.appRole,
            ),
          },
        },
        migrations: { enabled: false },
      }),
      StynxOfflineSyncModule.forRoot({
        context: { current: () => ({ tenantId: value.tenants[0], actorId: actor }) },
        policyResolver: { resolve: async () => ({ maxBatchItems: 20 }) },
        agentResolver: { resolve: async () => 'business-agent' },
        itemApplier: { apply },
        payloadHashPort: { hash },
        eventPort: { appendInTransaction: append, appendManyInTransaction: append },
      }),
    ],
  })
    .overrideGuard(StynxAuthGuard)
    .useValue({ canActivate: () => true })
    .overrideGuard(PermissionGuard)
    .useValue({ canActivate: () => true })
    .compile();
  const contexts = moduleRef.get(RequestContextMutator);
  const app = moduleRef.createNestApplication();
  app.use((req: Request & { actor?: { id: string } }, _res: Response, next: NextFunction) => {
    req.actor = { id: actor };
    contexts.runWithRequestContext(
      {
        requestId: randomUUID(),
        tenantId: value.tenants[0],
        actorId: actor,
        startedAt: new Date(),
      },
      next,
    );
  });
  await app.init();
  return {
    app,
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
