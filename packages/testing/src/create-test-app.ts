import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { GenericContainer, Wait } from 'testcontainers';
import { RequestContextMutator } from '@stynx/core';
import { createStynxPgClient, Database, StynxDataModule, type StynxPgClient } from '@stynx/data';
import type {
  CreateTestAppOptions,
  StartedCognitoHandle,
  StartedLocalstackHandle,
  StartedPostgresHandle,
  StartedRedisHandle,
  TestAppContext,
  TestSqlStep,
} from './types';

async function applySqlSteps(client: StynxPgClient, steps: TestSqlStep[]): Promise<void> {
  for (const step of steps) {
    if (typeof step === 'string') {
      await client.query(step);
      continue;
    }
    await step(client);
  }
}

async function startPostgresContainer(): Promise<StartedPostgresHandle> {
  const container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({
      POSTGRES_DB: 'postgres',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'postgres',
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/u))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const auth = `postgres:postgres@${host}:${port}`;
  return {
    container,
    connectionString: `postgresql://${auth}/postgres`,
    adminConnectionString: `postgresql://${auth}/postgres`,
  };
}

async function startRedisContainer(): Promise<StartedRedisHandle> {
  const container = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/u))
    .start();

  return {
    container,
    url: `redis://${container.getHost()}:${container.getMappedPort(6379)}`,
  };
}

async function startLocalstackContainer(services: string[]): Promise<StartedLocalstackHandle> {
  const container = await new GenericContainer('localstack/localstack:3.8.1')
    .withEnvironment({
      SERVICES: services.join(','),
      AWS_DEFAULT_REGION: 'us-east-1',
    })
    .withExposedPorts(4566)
    .withWaitStrategy(Wait.forLogMessage(/Ready\./u))
    .start();

  return {
    container,
    endpoint: `http://${container.getHost()}:${container.getMappedPort(4566)}`,
    region: 'us-east-1',
  };
}

async function startCognitoContainer(image: string): Promise<StartedCognitoHandle> {
  const region = 'us-east-1';
  const userPoolId = 'local_testing_pool';
  const clientId = 'local_testing_client';
  const container = await new GenericContainer(image)
    .withEnvironment({
      AWS_DEFAULT_REGION: region,
      COGNITO_LOCAL_PORT: '9229',
      COGNITO_LOCAL_USER_POOLS: JSON.stringify([
        {
          Id: userPoolId,
          Name: 'stynx-testing',
          Clients: [{ ClientId: clientId, ClientName: 'stynx-testing-client' }],
        },
      ]),
    })
    .withExposedPorts(9229)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  return {
    container,
    endpoint: `http://${container.getHost()}:${container.getMappedPort(9229)}`,
    region,
    userPoolId,
    clientId,
  };
}

function connectionStringWithAppName(base: string, appName: string): string {
  const url = new URL(base);
  url.searchParams.set('application_name', appName);
  return url.toString();
}

export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestAppContext> {
  let postgres: StartedPostgresHandle | undefined;
  let redis: StartedRedisHandle | undefined;
  let localstack: StartedLocalstackHandle | undefined;
  let cognito: StartedCognitoHandle | undefined;
  let testingModule;
  let app: INestApplication | undefined;

  try {
    postgres = await startPostgresContainer();
    redis = await startRedisContainer();
    localstack = options.localstack?.enabled === false
      ? undefined
      : await startLocalstackContainer(options.localstack?.services ?? ['s3', 'kms']);
    cognito = options.cognito?.enabled
      ? await startCognitoContainer(options.cognito.image ?? 'jagregory/cognito-local:latest')
      : undefined;

    testingModule = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: connectionStringWithAppName(postgres.connectionString, '@stynx/testing:owner') },
            app: { connectionString: connectionStringWithAppName(postgres.connectionString, '@stynx/testing:app') },
            reader: { connectionString: connectionStringWithAppName(postgres.connectionString, '@stynx/testing:reader') },
          },
          migrations: { enabled: true },
        }),
        ...(options.overrides?.imports ?? []),
      ],
      controllers: options.overrides?.controllers ?? [],
      providers: options.overrides?.providers ?? [],
    }).compile();

    app = testingModule.createNestApplication();
    await app.init();

    async function adminClient(): Promise<StynxPgClient> {
      const client = createStynxPgClient({ connectionString: postgres!.adminConnectionString });
      await client.connect();
      return client;
    }

    if ((options.migrations?.length ?? 0) > 0 || (options.seeds?.length ?? 0) > 0) {
      const client = await adminClient();
      try {
        if (options.migrations) {
          await applySqlSteps(client, options.migrations);
        }
        if (options.seeds) {
          await applySqlSteps(client, options.seeds);
        }
      } finally {
        await client.end();
      }
    }

    const database = testingModule.get(Database);
    const requestContextMutator = testingModule.get(RequestContextMutator);

    return {
      app,
      moduleRef: testingModule,
      database,
      requestContextMutator,
      postgres,
      redis,
      ...(localstack ? { localstack } : {}),
      ...(cognito ? { cognito } : {}),
      adminClient,
      async tx<T>(fn: (trx: import('@stynx/data').Transaction) => Promise<T>) {
        return database.withSystemContext('stynx testing harness', async () =>
          database.tx(fn, {
            role: 'owner',
            readonly: false,
            replica: false,
          }),
        );
      },
      async teardown(): Promise<void> {
        await app?.close();
        await cognito?.container.stop();
        await localstack?.container.stop();
        await redis?.container.stop();
        await postgres?.container.stop();
      },
    };
  } catch (error) {
    await app?.close().catch(() => undefined);
    await cognito?.container.stop().catch(() => undefined);
    await localstack?.container.stop().catch(() => undefined);
    await redis?.container.stop().catch(() => undefined);
    await postgres?.container.stop().catch(() => undefined);
    throw error;
  }
}
