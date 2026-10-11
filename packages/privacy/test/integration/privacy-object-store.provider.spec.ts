import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import {
  CreateBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import JSZip from 'jszip';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';

// Exercise the public compiled package graph and the real AWS SDK, without source aliases.
const require = createRequire(import.meta.url);
const { PrivacyObjectStoreService } = require('@stynx-nyx/privacy') as typeof import('../../src');

// LocalStack is the repository's declared local S3 fixture, not production qualification.
describe('PrivacyObjectStoreService supported local S3 provider', () => {
  const region = 'us-east-1';
  const bucketName = `stynx-privacy-provider-${randomUUID()}`;
  const tenantA = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
  const tenantB = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
  const keyA = `exports/${tenantA}/${randomUUID()}.zip`;
  const keyB = `exports/${tenantB}/${randomUUID()}.zip`;
  const credentials = { accessKeyId: 'test', secretAccessKey: 'test' };
  const environmentKeys = [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_REGION',
    'AWS_EC2_METADATA_DISABLED',
  ] as const;
  const priorEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  let container: StartedTestContainer | undefined;
  let admin: S3Client | undefined;
  let endpoint: string;
  let store: InstanceType<typeof PrivacyObjectStoreService>;
  let bytesA: Buffer;
  let bytesB: Buffer;

  beforeAll(async () => {
    process.env.AWS_ACCESS_KEY_ID = credentials.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = credentials.secretAccessKey;
    delete process.env.AWS_SESSION_TOKEN;
    process.env.AWS_REGION = region;
    process.env.AWS_EC2_METADATA_DISABLED = 'true';
    container = await new GenericContainer('localstack/localstack:3.8.1')
      .withEnvironment({
        SERVICES: 's3',
        AWS_DEFAULT_REGION: region,
        S3_SKIP_SIGNATURE_VALIDATION: '0',
      })
      .withExposedPorts(4566)
      .withWaitStrategy(Wait.forLogMessage(/Ready\./))
      .start();
    endpoint = `http://${container.getHost()}:${container.getMappedPort(4566)}`;
    admin = new S3Client({ region, endpoint, forcePathStyle: true, credentials });
    await admin.send(new CreateBucketCommand({ Bucket: bucketName }));
    store = new PrivacyObjectStoreService({
      environment: 'test',
      region,
      bucketName,
      endpoint,
      forcePathStyle: true,
    });
    bytesA = await new JSZip()
      .file('manifest.json', JSON.stringify({ tenantId: tenantA, format: 'json' }))
      .file('privacy.subjects.json', JSON.stringify([{ tenantId: tenantA, name: 'João 日本語' }]))
      .generateAsync({ type: 'nodebuffer' });
    bytesB = await new JSZip()
      .file('manifest.json', JSON.stringify({ tenantId: tenantB, format: 'json' }))
      .file('privacy.subjects.json', JSON.stringify([{ tenantId: tenantB, name: 'Other tenant' }]))
      .generateAsync({ type: 'nodebuffer' });
    await store.putObject({ key: keyA, body: bytesA, contentType: 'application/zip' });
    await store.putObject({ key: keyB, body: bytesB, contentType: 'application/zip' });
  }, 120_000);

  afterAll(async () => {
    try {
      admin?.destroy();
      await container?.stop();
    } finally {
      for (const key of environmentKeys) {
        const value = priorEnvironment[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 120_000);

  it('uploads exact ZIP bytes, content type and Expires through the public adapter', async () => {
    const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + 3_600_000);
    await store.putObject({ key: keyA, body: bytesA, contentType: 'application/zip', expiresAt });
    const head = await admin!.send(new HeadObjectCommand({ Bucket: bucketName, Key: keyA }));
    expect(head.ContentLength).toBe(bytesA.length);
    expect(head.ContentType).toBe('application/zip');
    expect(head.Expires?.getTime()).toBe(expiresAt.getTime());
    const url = await store.presignDownload({ key: keyA, expiresInSeconds: 30 });
    const parsed = new URL(url);
    expect(parsed.origin).toBe(endpoint);
    expect(decodeURIComponent(parsed.pathname)).toBe(`/${bucketName}/${keyA}`);
    expect(parsed.searchParams.get('X-Amz-Expires')).toBe('30');
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/zip');
    const downloaded = Buffer.from(await response.arrayBuffer());
    expect(downloaded).toEqual(bytesA);
    const zip = await JSZip.loadAsync(downloaded);
    expect(Object.keys(zip.files).sort()).toEqual(['manifest.json', 'privacy.subjects.json']);
    expect(JSON.parse(await zip.file('manifest.json')!.async('string'))).toEqual({
      tenantId: tenantA,
      format: 'json',
    });
    expect(JSON.parse(await zip.file('privacy.subjects.json')!.async('string'))).toEqual([
      { tenantId: tenantA, name: 'João 日本語' },
    ]);
  });

  it('preserves distinct tenant keys and confines a signed download to its exact object', async () => {
    await store.putObject({ key: keyA, body: bytesA, contentType: 'application/zip' });
    await store.putObject({ key: keyB, body: bytesB, contentType: 'application/zip' });
    const roster = await admin!.send(new ListObjectsV2Command({ Bucket: bucketName }));
    expect(roster.Contents?.map((object) => object.Key).sort()).toEqual([keyA, keyB].sort());
    const signedA = await store.presignDownload({ key: keyA, expiresInSeconds: 30 });
    const signedB = await store.presignDownload({ key: keyB, expiresInSeconds: 30 });
    expect(Buffer.from(await (await fetch(signedA)).arrayBuffer())).toEqual(bytesA);
    expect(Buffer.from(await (await fetch(signedB)).arrayBuffer())).toEqual(bytesB);
    const tampered = new URL(signedA);
    tampered.pathname = `/${bucketName}/${keyB}`;
    const refused = await fetch(tampered);
    expect(refused.status).toBe(403);
    expect(await refused.text()).toContain('SignatureDoesNotMatch');
  });

  it('enforces actual signed-URL expiry while preserving separately uploaded bytes', async () => {
    await store.putObject({
      key: keyA,
      body: bytesA,
      contentType: 'application/zip',
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const signed = await store.presignDownload({ key: keyA, expiresInSeconds: 3 });
    expect(new URL(signed).searchParams.get('X-Amz-Expires')).toBe('3');
    expect((await fetch(signed)).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 4_100));
    const expired = await fetch(signed);
    expect(expired.status).toBe(403);
    expect(await expired.text()).toMatch(/expired/iu);
    const fresh = await store.presignDownload({ key: keyA, expiresInSeconds: 30 });
    expect(Buffer.from(await (await fetch(fresh)).arrayBuffer())).toEqual(bytesA);
  });

  it('propagates actual S3 upload failures and SDK presign-bound refusals', async () => {
    const missingBucket = new PrivacyObjectStoreService({
      environment: 'test',
      region,
      bucketName: `missing-${randomUUID()}`,
      endpoint,
      forcePathStyle: true,
    });
    await expect(
      missingBucket.putObject({
        key: keyA,
        body: bytesA,
        contentType: 'application/zip',
      }),
    ).rejects.toMatchObject({ name: 'NoSuchBucket', $metadata: { httpStatusCode: 404 } });
    await expect(
      store.presignDownload({ key: keyA, expiresInSeconds: 604_801 }),
    ).rejects.toMatchObject({
      name: 'Error',
      message:
        'Signature version 4 presigned URLs must have an expiration date less than one week in the future',
    });
    const roster = await admin!.send(new ListObjectsV2Command({ Bucket: bucketName }));
    expect(roster.Contents?.map((object) => object.Key).sort()).toEqual([keyA, keyB].sort());
  });
});
