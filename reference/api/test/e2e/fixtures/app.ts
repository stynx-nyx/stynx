import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { CognitoJwtValidator } from '@stynx/auth';
import { RequestContextMutator } from '@stynx/core';
import { Database } from '@stynx/data';
import { StynxI18nModule } from '@stynx/i18n';
import { SessionService } from '@stynx/sessions';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../../../packages/data/test/support/postgres';
import { actors, type ActorName, seedRecordsAndNotesE2e } from './seed';

export interface ReferenceApiE2eContext {
  app: INestApplication;
  database: Database;
  requestContextMutator: RequestContextMutator;
  postgres: PostgresTestDatabase;
  redis: StartedTestContainer;
  tokens: Record<ActorName, string>;
}

export interface ReferenceApiE2eOptions {
  databaseName?: string;
  includeI18n?: boolean;
  cognitoClaims?: {
    sub: string;
    email: string;
    claims?: Record<string, unknown>;
  };
}

class FixedCognitoJwtValidator {
  constructor(private readonly result: NonNullable<ReferenceApiE2eOptions['cognitoClaims']>) {}

  async validateAccessToken(): Promise<{ sub: string; email: string; claims: Record<string, unknown> }> {
    return {
      sub: this.result.sub,
      email: this.result.email,
      claims: this.result.claims ?? {},
    };
  }
}

function setRuntimeEnvironment(postgres: PostgresTestDatabase, redisUrl: string): void {
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_EC2_METADATA_DISABLED = 'true';
  process.env.STYNX_OWNER_DATABASE_URL = postgres.connectionString('@stynx/reference-api-e2e:owner');
  process.env.STYNX_APP_DATABASE_URL = postgres.connectionString('@stynx/reference-api-e2e:app');
  process.env.STYNX_READER_DATABASE_URL = postgres.connectionString('@stynx/reference-api-e2e:reader');
  process.env.STYNX_REDIS_URL = redisUrl;
  process.env.STYNX_STORAGE_ENDPOINT = 'http://127.0.0.1:4566';
  process.env.STYNX_STORAGE_FORCE_PATH_STYLE = 'true';
  process.env.STYNX_STORAGE_BUCKET = 'stynx-docs-local-us-east-1';
  process.env.STYNX_ENVIRONMENT = 'local';
  process.env.STYNX_STORAGE_REGION = 'us-east-1';
  process.env.STYNX_KMS_ALIAS = 'stynx-local';
  process.env.STYNX_STYNX_ISSUER = 'https://reference-api.e2e.test';
  process.env.STYNX_COGNITO_ISSUER = 'https://cognito.local';
}

async function mintActorSessions(sessionService: SessionService): Promise<Record<ActorName, string>> {
  const entries = await Promise.all(
    (Object.entries(actors) as Array<[ActorName, typeof actors[ActorName]]>).map(async ([name, actor]) => {
      const session = await sessionService.create(
        actor.userId,
        actor.tenantId,
        actor.userId,
        {},
        { membershipId: actor.membershipId },
      );
      return [name, session.accessToken] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<ActorName, string>;
}

export async function setupReferenceApiE2e(options: ReferenceApiE2eOptions = {}): Promise<ReferenceApiE2eContext> {
  const postgres = await createPostgresTestDatabase(options.databaseName ?? 'reference_api_records_notes');
  const redis = await new GenericContainer('redis:7-alpine')
    .withEnvironment({ GLOG_minloglevel: '2' })
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/u))
    .start();

  setRuntimeEnvironment(postgres, `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`);

  const { AppModule } = await import('../../../src/app.module');
  const moduleBuilder = Test.createTestingModule({
    imports: [
      AppModule,
      ...(options.includeI18n ? [StynxI18nModule.forRoot()] : []),
    ],
  });
  if (options.cognitoClaims) {
    moduleBuilder
      .overrideProvider(CognitoJwtValidator)
      .useValue(new FixedCognitoJwtValidator(options.cognitoClaims));
  }
  const moduleRef = await moduleBuilder.compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  await seedRecordsAndNotesE2e(postgres);

  const sessionService = moduleRef.get(SessionService);
  return {
    app,
    database: moduleRef.get(Database),
    requestContextMutator: moduleRef.get(RequestContextMutator),
    postgres,
    redis,
    tokens: await mintActorSessions(sessionService),
  };
}

export async function closeReferenceApiE2e(context: ReferenceApiE2eContext | undefined): Promise<void> {
  await context?.app.close();
  await context?.redis.stop();
  await context?.postgres.dispose();
}

export async function queryRowsAsTenant<T>(
  context: ReferenceApiE2eContext,
  tenantId: string,
  actorId: string,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  return Promise.resolve(
    context.requestContextMutator.runWithRequestContext(
      {
        requestId: `records-notes-e2e-${Date.now()}`,
        tenantId,
        actorId,
        startedAt: new Date(),
      },
      () =>
        context.database.tx(
          async (trx) => {
            await trx.query('set local role stynx_reader');
            const result = await trx.query<T & Record<string, unknown>>(sql, values);
            return result.rows;
          },
          { role: 'reader', readonly: true },
        ),
    ),
  );
}
