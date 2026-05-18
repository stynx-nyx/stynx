import { createHash, randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import {
  CreateBucketCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { RequestContextMutator } from '@stynx/core';
import { Database, StynxDataModule } from '@stynx/data';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { DocumentsService } from '../../src/documents.service';
import { StorageTenantMismatchError } from '../../src/errors';
import { StynxStorageModule } from '../../src/storage.module';

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function seedTenantAndUser(
  database: PostgresTestDatabase,
  tenantId: string,
  userId: string,
): Promise<void> {
  const slug = `tenant-${tenantId.replace(/-/g, '')}`;
  const admin = await database.connectAsAdmin();
  try {
    await admin.query(
      `
        insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values ($1::uuid, $2, $3, true, clock_timestamp(), clock_timestamp())
      `,
      [tenantId, slug, `Tenant ${tenantId.slice(0, 8)}`],
    );
    await admin.query(
      `
        insert into auth.users (id, email, created_at, updated_at)
        values ($1::uuid, $2, clock_timestamp(), clock_timestamp())
      `,
      [userId, `${userId.replace(/-/g, '')}@example.com`],
    );
  } finally {
    await admin.end();
  }
}

describe('StynxStorageModule integration', () => {

  const originalAwsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const originalAwsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const originalAwsRegion = process.env.AWS_REGION;
  const originalAwsMetadataDisabled = process.env.AWS_EC2_METADATA_DISABLED;

  let localstack: StartedTestContainer | undefined;
  let testDatabase: PostgresTestDatabase | undefined;
  let moduleRef: TestingModule | undefined;
  let documentsService: DocumentsService;
  let requestContextMutator: RequestContextMutator;
  let database: Database;
  let adminS3: S3Client;
  let endpoint: string;

  const bucketName = 'stynx-docs-test-us-east-1';
  const tenantA = '01978f4a-32bf-7c27-a131-fd73a9e001a1';
  const tenantB = '01978f4a-32bf-7c27-a131-fd73a9e001a2';
  const actorA = '01978f4a-32bf-7c27-a131-fd73a9e002a1';
  const actorB = '01978f4a-32bf-7c27-a131-fd73a9e002a2';

  async function withRequestContext<T>(tenantId: string, actorId: string, fn: () => Promise<T>): Promise<T> {
    return Promise.resolve(
      requestContextMutator.runWithRequestContext(
        {
          requestId: randomUUID(),
          tenantId,
          actorId,
          startedAt: new Date(),
        },
        fn,
      ),
    );
  }

  async function queryValue<T = unknown>(text: string, values: unknown[]): Promise<T | undefined> {
    return database.withSystemContext('storage integration assertions', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<{ value: T }>(text, values);
          return result.rows[0]?.value;
        },
        { role: 'owner', readonly: true, replica: false },
      ),
    );
  }

  async function uploadPresignedObject(url: string, headers: Record<string, string>, body: Buffer): Promise<void> {
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body,
    });
    if (response.ok) {
      return;
    }

    throw new Error(`Presigned upload failed: ${response.status} ${response.statusText} ${await response.text()}`);
  }

  beforeAll(async () => {
    process.env.AWS_ACCESS_KEY_ID = 'test';
    process.env.AWS_SECRET_ACCESS_KEY = 'test';
    process.env.AWS_REGION = 'us-east-1';
    process.env.AWS_EC2_METADATA_DISABLED = 'true';

    localstack = await new GenericContainer('localstack/localstack:3.8.1')
      .withEnvironment({
        GLOG_minloglevel: '2',
        SERVICES: 's3',
        AWS_DEFAULT_REGION: 'us-east-1',
      })
      .withExposedPorts(4566)
      .withWaitStrategy(Wait.forLogMessage(/Ready\./))
      .start();

    endpoint = `http://${localstack.getHost()}:${localstack.getMappedPort(4566)}`;
    adminS3 = new S3Client({
      region: 'us-east-1',
      endpoint,
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

    testDatabase = await createPostgresTestDatabase('stynx_storage');
    moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: testDatabase.connectionString('@stynx/storage:owner') },
            app: { connectionString: testDatabase.connectionString('@stynx/storage:app') },
            reader: { connectionString: testDatabase.connectionString('@stynx/storage:reader') },
          },
          migrations: { enabled: true },
        }),
        StynxStorageModule.forRoot({
          environment: 'test',
          region: 'us-east-1',
          kmsAlias: 'stynx-docs',
          bucketName,
          endpoint,
          forcePathStyle: true,
          collections: {
            invoices: {
              mimeAllowlist: ['application/pdf'],
              maxBytes: 1024 * 1024,
              classificationDefault: 'internal',
            },
          },
        }),
      ],
    }).compile();
    await moduleRef.init();

    documentsService = moduleRef.get(DocumentsService);
    requestContextMutator = moduleRef.get(RequestContextMutator);
    database = moduleRef.get(Database);

    await seedTenantAndUser(testDatabase, tenantA, actorA);
    await seedTenantAndUser(testDatabase, tenantB, actorB);
  });

  afterAll(async () => {
    await moduleRef?.close();
    await testDatabase?.dispose();
    await localstack?.stop();

    process.env.AWS_ACCESS_KEY_ID = originalAwsAccessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = originalAwsSecretAccessKey;
    process.env.AWS_REGION = originalAwsRegion;
    process.env.AWS_EC2_METADATA_DISABLED = originalAwsMetadataDisabled;
  });

  it('presigns an upload, completes it, and returns a working download URL', async () => {
    const payload = Buffer.from('%PDF-1.4 storage integration');
    const checksumSha256 = sha256Hex(payload);

    const initiated = await withRequestContext(tenantA, actorA, () =>
      documentsService.initiate({
        collection: 'invoices',
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        byteSize: payload.length,
        checksumSha256,
      }),
    );

    await uploadPresignedObject(initiated.upload.url, initiated.upload.headers, payload);

    await expect(
      withRequestContext(tenantA, actorA, () => documentsService.complete(initiated.id)),
    ).resolves.toEqual({
      id: initiated.id,
      scanStatus: 'completed',
    });

    const download = await withRequestContext(tenantA, actorA, () =>
      documentsService.getDownloadUrl(initiated.id),
    );
    const downloadResponse = await fetch(download.url);
    expect(downloadResponse.ok).toBe(true);
    expect(Buffer.from(await downloadResponse.arrayBuffer())).toEqual(payload);

    await expect(
      queryValue<string>(
        `
          select scan_status as value
          from storage.documents
          where id = $1::uuid
        `,
        [initiated.id],
      ),
    ).resolves.toBe('completed');
  });

  it('quarantines documents whose uploaded object metadata does not match', async () => {
    const payload = Buffer.from('not really a pdf');
    const initiated = await withRequestContext(tenantA, actorA, () =>
      documentsService.initiate({
        collection: 'invoices',
        filename: 'invoice.pdf',
        mimeType: 'application/pdf',
        byteSize: payload.length,
        checksumSha256: sha256Hex(Buffer.from('%PDF-1.4 expected')),
      }),
    );

    await adminS3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: initiated.s3Key,
        Body: payload,
        ContentType: 'image/png',
        Metadata: {
          sha256: sha256Hex(payload),
        },
      }),
    );

    await expect(
      withRequestContext(tenantA, actorA, () => documentsService.complete(initiated.id)),
    ).resolves.toEqual({
      id: initiated.id,
      scanStatus: 'quarantined',
    });

    await expect(
      queryValue<number>(
        `
          select count(*)::int as value
          from storage.documents
          where id = $1::uuid
        `,
        [initiated.id],
      ),
    ).resolves.toBe(0);
    await expect(
      queryValue<number>(
        `
          select count(*)::int as value
          from archive.storage_documents
          where id = $1::uuid
        `,
        [initiated.id],
      ),
    ).resolves.toBe(1);
  });

  it('rejects cross-tenant download presign attempts', async () => {
    const payload = Buffer.from('%PDF-1.4 tenant-isolated');
    const checksumSha256 = sha256Hex(payload);
    const initiated = await withRequestContext(tenantA, actorA, () =>
      documentsService.initiate({
        collection: 'invoices',
        filename: 'tenant-a.pdf',
        mimeType: 'application/pdf',
        byteSize: payload.length,
        checksumSha256,
      }),
    );

    await uploadPresignedObject(initiated.upload.url, initiated.upload.headers, payload);
    await withRequestContext(tenantA, actorA, () => documentsService.complete(initiated.id));

    await expect(
      withRequestContext(tenantB, actorB, () => documentsService.getDownloadUrl(initiated.id)),
    ).rejects.toBeInstanceOf(StorageTenantMismatchError);
  });

  it('hard-removes archived documents and purges all S3 versions', async () => {
    const payload = Buffer.from('%PDF-1.4 archive purge');
    const checksumSha256 = sha256Hex(payload);
    const initiated = await withRequestContext(tenantA, actorA, () =>
      documentsService.initiate({
        collection: 'invoices',
        filename: 'purge.pdf',
        mimeType: 'application/pdf',
        byteSize: payload.length,
        checksumSha256,
      }),
    );

    await uploadPresignedObject(initiated.upload.url, initiated.upload.headers, payload);
    await withRequestContext(tenantA, actorA, () => documentsService.complete(initiated.id));

    await adminS3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: initiated.s3Key,
        Body: Buffer.from('%PDF-1.4 archive purge v2'),
        ContentType: 'application/pdf',
        Metadata: { sha256: sha256Hex(Buffer.from('%PDF-1.4 archive purge v2')) },
      }),
    );

    await withRequestContext(tenantA, actorA, () => documentsService.softRemove(initiated.id));
    await withRequestContext(tenantA, actorA, () => documentsService.hardRemove(initiated.id));

    await expect(
      queryValue<number>(
        `
          select count(*)::int as value
          from archive.storage_documents
          where id = $1::uuid
        `,
        [initiated.id],
      ),
    ).resolves.toBe(0);

    const versions = await adminS3.send(
      new ListObjectVersionsCommand({
        Bucket: bucketName,
        Prefix: initiated.s3Key,
      }),
    );
    const remainingVersions = (versions.Versions ?? []).filter((entry) => entry.Key === initiated.s3Key);
    const remainingDeleteMarkers = (versions.DeleteMarkers ?? []).filter((entry) => entry.Key === initiated.s3Key);
    expect(remainingVersions).toHaveLength(0);
    expect(remainingDeleteMarkers).toHaveLength(0);
  });
});
