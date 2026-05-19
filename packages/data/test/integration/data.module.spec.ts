// @ts-nocheck
import { Test, type TestingModule } from '@nestjs/testing';
import { RequestContextMutator, SystemContextRequiredError } from '@stynx/core';
import { ActorContextMissingError, ReadOnlyViolationError } from '../../src/errors';
import { Database } from '../../src/database';
import { StynxDataModule } from '../../src/data.module';
import { createPostgresTestDatabase } from '../support/postgres';

describe('StynxDataModule integration', () => {

  it('configures GUCs, retries serialization failures, and isolates the three pools', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_data_module');
    let moduleRef: TestingModule | undefined;

    try {
      moduleRef = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: testDatabase.connectionString('stynx-owner') },
              app: { connectionString: testDatabase.connectionString('stynx-app') },
              reader: { connectionString: testDatabase.connectionString('stynx-reader') },
            },
          }),
        ],
      }).compile();
      await moduleRef.init();

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });

      const gucSnapshot = await requestContextMutator.runWithRequestContext(
        {
          requestId: 'req-1',
          tenantId: 'tenant-1',
          actorId: 'actor-1',
          sessionId: 'session-1',
          startedAt: new Date(),
        },
        async () =>
          database.tx(async (trx) => {
            const result = await trx.query<{
              tenant_id: string;
              actor_id: string;
              request_id: string;
              session_id: string;
              app_role: string;
              app_name: string;
            }>(`
              select
                current_setting('app.tenant_id', true) as tenant_id,
                current_setting('app.actor_id', true) as actor_id,
                current_setting('app.request_id', true) as request_id,
                current_setting('app.session_id', true) as session_id,
                current_setting('app.role', true) as app_role,
                current_setting('application_name', true) as app_name
            `);

            return result.rows[0];
          }),
      );

      expect(gucSnapshot).toMatchObject({
        tenant_id: 'tenant-1',
        actor_id: 'actor-1',
        request_id: 'req-1',
        session_id: 'session-1',
        app_role: 'app',
        app_name: 'stynx-app',
      });

      const readerName = await requestContextMutator.runWithRequestContext(
        {
          requestId: 'req-2',
          tenantId: 'tenant-1',
          actorId: 'actor-1',
          startedAt: new Date(),
        },
        () =>
          database.withReplica(async (trx) => {
            const result = await trx.query<{ app_name: string }>(
              `select current_setting('application_name', true) as app_name`,
            );
            return result.rows[0]?.app_name;
          }),
      );

      expect(readerName).toBe('stynx-reader');

      const ownerName = await database.withSystemContext('owner integration check', async () =>
        database.tx(
          async (trx) => {
            const result = await trx.query<{ app_name: string; app_role: string }>(
              `select current_setting('application_name', true) as app_name, current_setting('app.role', true) as app_role`,
            );
            return result.rows[0];
          },
          { role: 'owner', readonly: true },
        ),
      );

      expect(ownerName).toMatchObject({
        app_name: 'stynx-owner',
        app_role: 'owner',
      });

      let attempts = 0;
      const retryResult = await requestContextMutator.runWithRequestContext(
        {
          requestId: 'req-3',
          tenantId: 'tenant-1',
          actorId: 'actor-1',
          startedAt: new Date(),
        },
        () =>
          database.tx(async (trx) => {
            attempts += 1;
            if (attempts === 1) {
              const error = new Error('serialize me') as Error & { code: string };
              error.code = '40001';
              throw error;
            }
            const result = await trx.query<{ ok: number }>('select 1 as ok');
            return result.rows[0]?.ok;
          }),
      );

      expect(attempts).toBe(2);
      expect(retryResult).toBe(1);

      await requestContextMutator.runWithRequestContext(
        {
          requestId: 'req-4',
          tenantId: 'tenant-1',
          actorId: 'actor-1',
          startedAt: new Date(),
        },
        () =>
          database.tx(async (trx) => {
            await trx.query('create table if not exists stynx_reader_probe(id int primary key)');
          }),
      );

      await expect(
        requestContextMutator.runWithRequestContext(
          {
            requestId: 'req-5',
            tenantId: 'tenant-1',
            actorId: 'actor-1',
            startedAt: new Date(),
          },
          () =>
            database.tx(
              async (trx) => {
                await trx.query('insert into stynx_reader_probe(id) values (1)');
              },
              { role: 'reader', readonly: true },
            ),
        ),
      ).rejects.toBeInstanceOf(ReadOnlyViolationError);
    } finally {
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('rejects owner role outside system context', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_data_owner');
    let moduleRef: TestingModule | undefined;

    try {
      const baseConnectionString = testDatabase.connectionString('stynx-app');
      moduleRef = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: baseConnectionString },
              app: { connectionString: baseConnectionString },
              reader: { connectionString: baseConnectionString },
            },
          }),
        ],
      }).compile();
      await moduleRef.init();

      const database = moduleRef.get(Database);

      await expect(
        database.tx(async () => undefined, {
          role: 'owner',
          readonly: true,
        }),
      ).rejects.toBeInstanceOf(SystemContextRequiredError);
    } finally {
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('rejects app role when actor context is missing', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_data_actor');
    let moduleRef: TestingModule | undefined;

    try {
      const baseConnectionString = testDatabase.connectionString('stynx-app');
      moduleRef = await Test.createTestingModule({
        imports: [
          StynxDataModule.forRoot({
            connections: {
              owner: { connectionString: baseConnectionString },
              app: { connectionString: baseConnectionString },
              reader: { connectionString: baseConnectionString },
            },
          }),
        ],
      }).compile();
      await moduleRef.init();

      const database = moduleRef.get(Database);
      const requestContextMutator = moduleRef.get(RequestContextMutator, { strict: false });

      await expect(
        requestContextMutator.runWithRequestContext(
          {
            requestId: 'req-6',
            tenantId: 'tenant-1',
            startedAt: new Date(),
          },
          () => database.tx(async () => undefined),
        ),
      ).rejects.toBeInstanceOf(ActorContextMissingError);
    } finally {
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });
});
