import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { RequestContextMutator } from '@stynx/core';
import { Database, type StynxPgClient } from '@stynx/data';
import {
  StynxPrivacyModule,
  type PrivacyCognitoAdmin,
  type PrivacyObjectStore,
} from '@stynx/privacy';
import { SessionService } from '@stynx/sessions';
import {
  LGPD_FIXTURE_MIGRATIONS,
  lgpdFixturePiiMapYaml,
} from '@stynx/testing';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../../../packages/data/test/support/postgres';
import { actors, tenants, type ActorName, seedRecordsAndNotesE2e } from './seed';

export interface PrivacySubjectFixture {
  tenantId: string;
  actorId: string;
  subjectUserId: string;
  liveSubjectId: string;
  archivedSubjectId: string;
  liveAttachmentId: string;
  archivedAttachmentId: string;
}

export class InMemoryPrivacyObjectStore implements PrivacyObjectStore {
  readonly objects = new Map<string, Buffer>();

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
    expiresAt?: Date;
  }): Promise<void> {
    this.objects.set(input.key, input.body);
  }

  async presignDownload(input: { key: string; expiresInSeconds: number }): Promise<string> {
    return `memory://${input.key}?ttl=${input.expiresInSeconds}`;
  }
}

export class CapturingPrivacyCognitoAdmin implements PrivacyCognitoAdmin {
  readonly disabledUsers: string[] = [];

  async disableUser(subjectUserId: string): Promise<void> {
    this.disabledUsers.push(subjectUserId);
  }
}

export interface ReferenceApiPrivacyE2eContext {
  app: INestApplication;
  database: Database;
  requestContextMutator: RequestContextMutator;
  postgres: PostgresTestDatabase;
  redis: StartedTestContainer;
  tokens: Record<ActorName, string>;
  objectStore: InMemoryPrivacyObjectStore;
  cognitoAdmin: CapturingPrivacyCognitoAdmin;
  appRoot: string;
  subjects: {
    tenantA: PrivacySubjectFixture;
    tenantB: PrivacySubjectFixture;
  };
}

function samplePiiMapOverrides(): string {
  return [
    '  - tableSchema: sample',
    '    tableName: record',
    '    columnName: title',
    '    strategy: nullify',
    '    subjectColumn: owner_user_id',
    '    tenantColumn: tenant_id',
    '  - tableSchema: sample',
    '    tableName: record',
    '    columnName: email',
    '    strategy: hash_with_salt',
    '    subjectColumn: owner_user_id',
    '    tenantColumn: tenant_id',
    '  - tableSchema: sample',
    '    tableName: record',
    '    columnName: external_ref',
    '    strategy: hash_with_salt',
    '    subjectColumn: owner_user_id',
    '    tenantColumn: tenant_id',
    '  - tableSchema: sample',
    '    tableName: record_note',
    '    columnName: detail',
    '    strategy: nullify',
    '    subjectColumn: created_by',
    '    tenantColumn: tenant_id',
    '  - tableSchema: sample',
    '    tableName: record_note',
    '    columnName: detail2',
    '    strategy: nullify',
    '    subjectColumn: created_by',
    '    tenantColumn: tenant_id',
    '  - tableSchema: sample',
    '    tableName: record_note',
    '    columnName: region',
    '    strategy: nullify',
    '    subjectColumn: created_by',
    '    tenantColumn: tenant_id',
    '  - tableSchema: sample',
    '    tableName: record_note',
    '    columnName: code',
    '    strategy: nullify',
    '    subjectColumn: created_by',
    '    tenantColumn: tenant_id',
    '  - tableSchema: sample',
    '    tableName: work_item',
    '    columnName: created_by_user_id',
    '    strategy: nullify',
    '    subjectColumn: created_by_user_id',
    '    tenantColumn: tenant_id',
    '  - tableSchema: sample',
    '    tableName: work_item_lock',
    '    columnName: external_ref',
    '    strategy: nullify',
    '    subjectColumn: created_by',
    '    tenantColumn: tenant_id',
  ].join('\n');
}

function writePrivacyPiiMapOverride(appRoot: string): void {
  const privacyDir = resolve(appRoot, 'app/privacy');
  mkdirSync(privacyDir, { recursive: true });
  writeFileSync(
    resolve(privacyDir, 'pii-map.yaml'),
    `${lgpdFixturePiiMapYaml()}\n${samplePiiMapOverrides()}\n`,
    'utf8',
  );
}

function setRuntimeEnvironment(postgres: PostgresTestDatabase, redisUrl: string): void {
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_EC2_METADATA_DISABLED = 'true';
  process.env.STYNX_OWNER_DATABASE_URL = postgres.connectionString('@stynx/reference-api-privacy-e2e:owner');
  process.env.STYNX_APP_DATABASE_URL = postgres.connectionString('@stynx/reference-api-privacy-e2e:app');
  process.env.STYNX_READER_DATABASE_URL = postgres.connectionString('@stynx/reference-api-privacy-e2e:reader');
  process.env.STYNX_REDIS_URL = redisUrl;
  process.env.STYNX_STORAGE_ENDPOINT = 'http://127.0.0.1:4566';
  process.env.STYNX_STORAGE_FORCE_PATH_STYLE = 'true';
  process.env.STYNX_STORAGE_BUCKET = 'stynx-docs-local-us-east-1';
  process.env.STYNX_ENVIRONMENT = 'local';
  process.env.STYNX_STORAGE_REGION = 'us-east-1';
  process.env.STYNX_KMS_ALIAS = 'stynx-local';
  process.env.STYNX_STYNX_ISSUER = 'https://reference-api-privacy.e2e.test';
  process.env.STYNX_COGNITO_ISSUER = 'https://cognito.local';
}

async function applyLgpdFixtureMigrations(client: StynxPgClient): Promise<void> {
  for (const step of LGPD_FIXTURE_MIGRATIONS) {
    if (typeof step === 'string') {
      await client.query(step);
      continue;
    }
    await step(client);
  }
  await client.query(`
    grant select on privacy_fixture.subjects to stynx_reader;
    grant select on privacy_fixture.attachments to stynx_reader;
    grant select on archive.privacy_fixture_subjects to stynx_reader;
    grant select on archive.privacy_fixture_attachments to stynx_reader;
  `);
}

async function seedSubjectFixture(
  client: StynxPgClient,
  input: {
    tenantId: string;
    actorId: string;
    subjectUserId: string;
    liveEmail: string;
    archivedEmail: string;
  },
): Promise<PrivacySubjectFixture> {
  const ids: PrivacySubjectFixture = {
    tenantId: input.tenantId,
    actorId: input.actorId,
    subjectUserId: input.subjectUserId,
    liveSubjectId: randomUUID(),
    archivedSubjectId: randomUUID(),
    liveAttachmentId: randomUUID(),
    archivedAttachmentId: randomUUID(),
  };

  await client.query(`select set_config('app.tenant_id', $1, false)`, [ids.tenantId]);
  await client.query(`select set_config('app.actor_id', $1, false)`, [ids.actorId]);
  await client.query(
    `
      insert into privacy_fixture.subjects (id, tenant_id, subject_user_id, email, phone, note, profile_json, created_at)
      values
        ($1::uuid, $2::uuid, $3::uuid, $4, '5511999999999', 'tenant live note', '{"name":"Live Subject"}'::jsonb, clock_timestamp()),
        ($5::uuid, $2::uuid, $3::uuid, $6, '5511888888888', 'tenant archive note', '{"name":"Archived Subject"}'::jsonb, clock_timestamp() - interval '60 days')
    `,
    [
      ids.liveSubjectId,
      ids.tenantId,
      ids.subjectUserId,
      input.liveEmail,
      ids.archivedSubjectId,
      input.archivedEmail,
    ],
  );
  await client.query(
    `
      insert into privacy_fixture.attachments (id, tenant_id, subject_user_id, blob_key, created_at)
      values
        ($1::uuid, $2::uuid, $3::uuid, $4, clock_timestamp()),
        ($5::uuid, $2::uuid, $3::uuid, $6, clock_timestamp() - interval '60 days')
    `,
    [
      ids.liveAttachmentId,
      ids.tenantId,
      ids.subjectUserId,
      `s3://privacy/${ids.tenantId}/live`,
      ids.archivedAttachmentId,
      `s3://privacy/${ids.tenantId}/archive`,
    ],
  );
  await client.query(`select set_config('app.archive_move', 'in_progress', false)`);
  await client.query(`select set_config('app.archive_reason', 'soft_delete', false)`);
  await client.query(
    `
      insert into archive.privacy_fixture_subjects (
        id, tenant_id, subject_user_id, email, phone, note, profile_json, created_at, archived_at, deleted_at, deleted_by
      )
      select id, tenant_id, subject_user_id, email, phone, note, profile_json, created_at, clock_timestamp(), clock_timestamp(), $1::uuid
      from privacy_fixture.subjects
      where id = $2::uuid
    `,
    [ids.actorId, ids.archivedSubjectId],
  );
  await client.query(`delete from privacy_fixture.subjects where id = $1::uuid`, [ids.archivedSubjectId]);
  await client.query(
    `
      insert into archive.privacy_fixture_attachments (
        id, tenant_id, subject_user_id, blob_key, created_at, archived_at, deleted_at, deleted_by
      )
      select id, tenant_id, subject_user_id, blob_key, created_at, clock_timestamp(), clock_timestamp(), $1::uuid
      from privacy_fixture.attachments
      where id = $2::uuid
    `,
    [ids.actorId, ids.archivedAttachmentId],
  );
  await client.query(`delete from privacy_fixture.attachments where id = $1::uuid`, [ids.archivedAttachmentId]);

  return ids;
}

async function seedPrivacyE2e(database: PostgresTestDatabase): Promise<ReferenceApiPrivacyE2eContext['subjects']> {
  const client = await database.connectAsAdmin();
  try {
    await applyLgpdFixtureMigrations(client);
    return {
      tenantA: await seedSubjectFixture(client, {
        tenantId: tenants.tenantA,
        actorId: actors.adminA.userId,
        subjectUserId: actors.adminA.userId,
        liveEmail: 'privacy-tenant-a-live@example.com',
        archivedEmail: 'privacy-tenant-a-archive@example.com',
      }),
      tenantB: await seedSubjectFixture(client, {
        tenantId: tenants.tenantB,
        actorId: actors.adminB.userId,
        subjectUserId: actors.adminB.userId,
        liveEmail: 'privacy-tenant-b-live@example.com',
        archivedEmail: 'privacy-tenant-b-archive@example.com',
      }),
    };
  } finally {
    await client.end();
  }
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

export async function setupReferenceApiPrivacyE2e(): Promise<ReferenceApiPrivacyE2eContext> {
  const postgres = await createPostgresTestDatabase('reference_api_privacy');
  const redis = await new GenericContainer('redis:7-alpine')
    .withEnvironment({ GLOG_minloglevel: '2' })
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/u))
    .start();
  const appRoot = mkdtempSync(resolve(tmpdir(), 'stynx-reference-api-privacy-'));
  writePrivacyPiiMapOverride(appRoot);
  setRuntimeEnvironment(postgres, `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`);

  const objectStore = new InMemoryPrivacyObjectStore();
  const cognitoAdmin = new CapturingPrivacyCognitoAdmin();
  const { AppModule } = await import('../../../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [
      AppModule,
      StynxPrivacyModule.forRoot({
        appRoot,
        environment: 'test',
        region: 'us-east-1',
        erasureSalt: 'reference-api-privacy-e2e',
        exportTtlSeconds: 900,
        objectStore,
        cognitoAdmin,
      }),
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  await seedRecordsAndNotesE2e(postgres);
  const subjects = await seedPrivacyE2e(postgres);

  const sessionService = moduleRef.get(SessionService);
  return {
    app,
    database: moduleRef.get(Database),
    requestContextMutator: moduleRef.get(RequestContextMutator),
    postgres,
    redis,
    tokens: await mintActorSessions(sessionService),
    objectStore,
    cognitoAdmin,
    appRoot,
    subjects,
  };
}

export async function closeReferenceApiPrivacyE2e(context: ReferenceApiPrivacyE2eContext | undefined): Promise<void> {
  await context?.app.close();
  await context?.redis.stop();
  await context?.postgres.dispose();
  if (context?.appRoot) {
    rmSync(context.appRoot, { recursive: true, force: true });
  }
}
