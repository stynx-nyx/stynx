import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import {
  CreateBucketCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { RequestContextMutator } from '@stynx/core';
import { Database, documents } from '@stynx/data';
import { SessionService } from '@stynx/sessions';
import {
  auditExpect,
  expectInArchive,
  expectNotInLive,
  expectRestored,
  expectRLSIsolated,
} from '@stynx/testing';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../../../packages/data/test/support/postgres';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import { actors, tenants, type ActorName, seedRecordsAndNotesE2e } from '../fixtures/seed';

const bucketName = 'stynx-docs-local-us-east-1';
const documentPermissions = [
  'sample:document:read',
  'sample:document:write',
  'sample:document:delete',
  'sample:document:restore',
  'sample:document:hard-delete',
] as const;

interface DocumentsE2eContext extends ReferenceApiE2eContext {
  localstack: StartedTestContainer;
  adminS3: S3Client;
}

interface InitiatedDocumentBody {
  id: string;
  s3Key: string;
  upload: {
    url: string;
    headers: Record<string, string>;
  };
}

interface CompleteDocumentBody {
  id: string;
  scanStatus: string;
}

interface DownloadDocumentBody {
  id: string;
  url: string;
  expiresInSeconds: number;
}

interface DocumentRow extends Record<string, unknown> {
  id: string;
  tenantId?: string;
  tenant_id?: string;
  s3Key?: string;
  s3_key?: string;
  scanStatus?: string;
  scan_status?: string;
}

function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function uploadPresigned(url: string, headers: Record<string, string>, body: Buffer): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers,
    body,
  });
  if (!response.ok) {
    throw new Error(`Presigned upload failed: ${response.status} ${response.statusText} ${await response.text()}`);
  }
}

async function grantDocumentPermissions(database: PostgresTestDatabase): Promise<void> {
  const client = await database.connectAsAdmin();
  try {
    for (const permission of documentPermissions) {
      await client.query(
        `
          insert into auth.perms (id, key, description)
          values (gen_random_uuid(), $1, $1)
          on conflict (key) do nothing
        `,
        [permission],
      );
    }

    for (const permission of documentPermissions) {
      for (const membershipId of [actors.adminA.membershipId, actors.adminB.membershipId]) {
        await client.query(
          `
            insert into auth.direct_perms (id, membership_id, perm_id, effect)
            select gen_random_uuid(), $1::uuid, perm.id, 'allow'
            from auth.perms perm
            where perm.key = $2
          `,
          [membershipId, permission],
        );
      }
    }

    await client.query(
      `
        insert into auth.direct_perms (id, membership_id, perm_id, effect)
        select gen_random_uuid(), $1::uuid, perm.id, 'allow'
        from auth.perms perm
        where perm.key = $2
      `,
      [actors.viewerA.membershipId, 'sample:document:read'],
    );
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

function setRuntimeEnvironment(postgres: PostgresTestDatabase, redisUrl: string, storageEndpoint: string): void {
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_EC2_METADATA_DISABLED = 'true';
  process.env.STYNX_OWNER_DATABASE_URL = postgres.connectionString('@stynx/reference-api-documents-e2e:owner');
  process.env.STYNX_APP_DATABASE_URL = postgres.connectionString('@stynx/reference-api-documents-e2e:app');
  process.env.STYNX_READER_DATABASE_URL = postgres.connectionString('@stynx/reference-api-documents-e2e:reader');
  process.env.STYNX_REDIS_URL = redisUrl;
  process.env.STYNX_STORAGE_ENDPOINT = storageEndpoint;
  process.env.STYNX_STORAGE_FORCE_PATH_STYLE = 'true';
  process.env.STYNX_STORAGE_BUCKET = bucketName;
  process.env.STYNX_ENVIRONMENT = 'local';
  process.env.STYNX_STORAGE_REGION = 'us-east-1';
  process.env.STYNX_KMS_ALIAS = 'stynx-local';
  process.env.STYNX_STYNX_ISSUER = 'https://reference-api-documents.e2e.test';
  process.env.STYNX_COGNITO_ISSUER = 'https://cognito.local';
}

async function setupDocumentsE2e(): Promise<DocumentsE2eContext> {
  const postgres = await createPostgresTestDatabase('reference_api_documents');
  const redis = await new GenericContainer('redis:7-alpine')
    .withEnvironment({ GLOG_minloglevel: '2' })
    .withExposedPorts(6379)
    .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/u))
    .start();
  const localstack = await new GenericContainer('localstack/localstack:3.8.1')
    .withEnvironment({
      GLOG_minloglevel: '2',
      SERVICES: 's3',
      AWS_DEFAULT_REGION: 'us-east-1',
    })
    .withExposedPorts(4566)
    .withWaitStrategy(Wait.forLogMessage(/Ready\./u))
    .start();

  const storageEndpoint = `http://${localstack.getHost()}:${localstack.getMappedPort(4566)}`;
  setRuntimeEnvironment(postgres, `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`, storageEndpoint);

  const adminS3 = new S3Client({
    region: 'us-east-1',
    endpoint: storageEndpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
  });
  await adminS3.send(new CreateBucketCommand({ Bucket: bucketName }));
  await adminS3.send(
    new PutBucketVersioningCommand({
      Bucket: bucketName,
      VersioningConfiguration: { Status: 'Enabled' },
    }),
  );

  const { AppModule } = await import('../../../src/app.module');
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  await seedRecordsAndNotesE2e(postgres);
  await grantDocumentPermissions(postgres);

  const sessionService = moduleRef.get(SessionService);
  return {
    app,
    database: moduleRef.get(Database),
    requestContextMutator: moduleRef.get(RequestContextMutator),
    postgres,
    redis,
    localstack,
    adminS3,
    tokens: await mintActorSessions(sessionService),
  };
}

async function closeDocumentsE2e(context: DocumentsE2eContext | undefined): Promise<void> {
  await closeReferenceApiE2e(context);
  await context?.localstack.stop();
}

describe('@stynx/reference-api e2e documents', () => {
  let context: DocumentsE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;
  let documentId = '';
  let s3Key = '';

  beforeAll(async () => {
    context = await setupDocumentsE2e();
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeDocumentsE2e(context);
  });

  it('uploads, completes, and downloads a document with audit rows', async () => {
    const payload = Buffer.from('%PDF-1.4 documents e2e');
    const checksumSha256 = sha256Hex(payload);

    const initiated = (await adminA.post('/documents').send({
      collection: 'records',
      filename: 'documents-e2e.pdf',
      mimeType: 'application/pdf',
      byteSize: payload.length,
      checksumSha256,
      classification: 'internal',
    }).expect(201)).body as InitiatedDocumentBody;
    documentId = initiated.id;
    s3Key = initiated.s3Key;
    expect(initiated.s3Key).toContain(`${tenants.tenantA}/records/`);
    expect(initiated.upload.url).toContain(bucketName);
    await auditExpect(context.database, 'documents', 'sample.document.create', {
      schema: 'storage',
      rowId: documentId,
    });

    await uploadPresigned(initiated.upload.url, initiated.upload.headers, payload);

    const completed = (await adminA.post(`/documents/${documentId}/complete`).send({})
      .expect(201)).body as CompleteDocumentBody;
    expect(completed).toEqual({
      id: documentId,
      scanStatus: 'completed',
    });
    await auditExpect(context.database, 'documents', 'sample.document.complete', {
      schema: 'storage',
      rowId: documentId,
    });

    const download = (await adminA.get(`/documents/${documentId}/download`)
      .expect(200)).body as DownloadDocumentBody;
    expect(download).toEqual(expect.objectContaining({
      id: documentId,
      expiresInSeconds: expect.any(Number) as number,
    }));
    await auditExpect(context.database, 'documents', 'sample.document.download', {
      schema: 'storage',
      rowId: documentId,
    });

    const downloadResponse = await fetch(download.url);
    expect(downloadResponse.ok).toBe(true);
    expect(Buffer.from(await downloadResponse.arrayBuffer())).toEqual(payload);

    const visibleRows = await queryRowsAsTenant<DocumentRow>(
      context,
      tenants.tenantA,
      actors.adminA.userId,
      'select id::text, tenant_id::text, s3_key, scan_status from storage.documents where id = $1::uuid',
      [documentId],
    );
    expect(visibleRows).toEqual([
      expect.objectContaining({
        id: documentId,
        tenant_id: tenants.tenantA,
        s3_key: s3Key,
        scan_status: 'completed',
      }),
    ]);
  });

  it('denies document writes to the read-only viewer actor', async () => {
    await viewerA.post('/documents').send({
      collection: 'records',
      filename: 'viewer-denied.pdf',
      mimeType: 'application/pdf',
      byteSize: 12,
      checksumSha256: sha256Hex('viewer denied'),
    }).expect(403);

    await viewerA.delete(`/documents/${documentId}`).expect(403);
  });

  it('isolates documents across tenants through HTTP and RLS', async () => {
    await adminB.get(`/documents/${documentId}/download`).expect(403);

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<DocumentRow>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text from storage.documents',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
  });

  it('soft-deletes, restores, and hard-deletes document object versions', async () => {
    await adminA.delete(`/documents/${documentId}`).expect(200);
    await auditExpect(context.database, 'documents', 'sample.document.soft-delete', {
      schema: 'storage',
      rowId: documentId,
    });
    await expectInArchive(context.database, documents, documentId);
    await expectNotInLive(context.database, documents, documentId);

    await adminA.post(`/documents/${documentId}/restore`).send({}).expect(201);
    await auditExpect(context.database, 'documents', 'sample.document.restore', {
      schema: 'storage',
      rowId: documentId,
    });
    await expectRestored(context.database, documents, documentId);

    const hardDeletePayload = Buffer.from('%PDF-1.4 documents e2e hard delete');
    const hardDeleteDocument = (await adminA.post('/documents').send({
      collection: 'records',
      filename: 'documents-e2e-hard-delete.pdf',
      mimeType: 'application/pdf',
      byteSize: hardDeletePayload.length,
      checksumSha256: sha256Hex(hardDeletePayload),
      classification: 'internal',
    }).expect(201)).body as InitiatedDocumentBody;
    await uploadPresigned(hardDeleteDocument.upload.url, hardDeleteDocument.upload.headers, hardDeletePayload);
    await adminA.post(`/documents/${hardDeleteDocument.id}/complete`).send({}).expect(201);

    const payloadV2 = Buffer.from('%PDF-1.4 documents e2e hard delete v2');
    await context.adminS3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: hardDeleteDocument.s3Key,
        Body: payloadV2,
        ContentType: 'application/pdf',
        Metadata: { sha256: sha256Hex(payloadV2) },
      }),
    );

    const beforeDeleteVersions = await context.adminS3.send(
      new ListObjectVersionsCommand({
        Bucket: bucketName,
        Prefix: hardDeleteDocument.s3Key,
      }),
    );
    expect((beforeDeleteVersions.Versions ?? []).filter((entry) => entry.Key === hardDeleteDocument.s3Key).length)
      .toBeGreaterThanOrEqual(2);

    await adminA.delete(`/documents/${hardDeleteDocument.id}`).expect(200);
    await expectInArchive(context.database, documents, hardDeleteDocument.id);
    await expectNotInLive(context.database, documents, hardDeleteDocument.id);

    await adminA.delete(`/documents/${hardDeleteDocument.id}/hard`).expect(200);
    await auditExpect(context.database, 'documents', 'sample.document.hard-delete', {
      schema: 'storage',
      rowId: hardDeleteDocument.id,
    });
    await expectNotInLive(context.database, documents, hardDeleteDocument.id);

    const afterHardDeleteVersions = await context.adminS3.send(
      new ListObjectVersionsCommand({
        Bucket: bucketName,
        Prefix: hardDeleteDocument.s3Key,
      }),
    );
    expect((afterHardDeleteVersions.Versions ?? []).filter((entry) => entry.Key === hardDeleteDocument.s3Key))
      .toHaveLength(0);
    expect((afterHardDeleteVersions.DeleteMarkers ?? []).filter((entry) => entry.Key === hardDeleteDocument.s3Key))
      .toHaveLength(0);
  });
});
