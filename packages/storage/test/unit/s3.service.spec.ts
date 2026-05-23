import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  PutObjectRetentionCommand,
  type PutBucketLifecycleConfigurationCommandInput,
  type PutObjectRetentionCommandInput,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageValidationError } from '../../src/errors';
import { S3Service } from '../../src/s3.service';
import type { Mock } from 'vitest';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed.example.test/object'),
}));

type CommandWithInput<TInput> = {
  input: TInput;
};

describe('S3Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-26T12:00:00.000Z').getTime());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects bucket names outside the required pattern', () => {
    expect(
      () =>
        new S3Service({
          environment: 'dev',
          region: 'us-east-1',
          kmsAlias: 'stynx-docs',
          bucketName: 'custom-bucket',
          collections: {},
        }),
    ).toThrow(StorageValidationError);
  });

  it('rate-limits tenant download presigns by minute', async () => {
    const service = new S3Service({
      environment: 'dev',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
      compliance: {
        presignRateLimit: { maxPerMinute: 2 },
      },
    });

    await expect(
      service.presignDownloadForTenant({ key: 'tenant-a/docs/one.pdf', tenantId: 'tenant-a' }),
    ).resolves.toBe('https://signed.example.test/object');
    await expect(
      service.presignDownloadForTenant({ key: 'tenant-a/docs/two.pdf', tenantId: 'tenant-a' }),
    ).resolves.toBe('https://signed.example.test/object');
    await expect(
      service.presignDownloadForTenant({ key: 'tenant-a/docs/three.pdf', tenantId: 'tenant-a' }),
    ).rejects.toMatchObject({
      message: 'Presign rate limit exceeded for tenant tenant-a: 2 per minute',
      context: { tenantId: 'tenant-a', limit: 2 },
    });

    expect(getSignedUrl).toHaveBeenCalledTimes(2);
    const signedCommand = (getSignedUrl as Mock).mock.calls[0]?.[1];
    expect(signedCommand).toBeInstanceOf(GetObjectCommand);

    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-26T12:01:01.000Z').getTime());
    await expect(
      service.presignDownloadForTenant({ key: 'tenant-a/docs/four.pdf', tenantId: 'tenant-a', expiresInSeconds: 10 }),
    ).resolves.toBe('https://signed.example.test/object');
  });

  it('resets tenant presign counters exactly at the one-minute boundary', async () => {
    const service = new S3Service({
      environment: 'dev',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
      compliance: {
        presignRateLimit: { maxPerMinute: 1 },
      },
    });

    await expect(
      service.presignDownloadForTenant({ key: 'tenant-a/docs/one.pdf', tenantId: 'tenant-a' }),
    ).resolves.toBe('https://signed.example.test/object');
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-26T12:01:00.000Z').getTime());
    await expect(
      service.presignDownloadForTenant({ key: 'tenant-a/docs/two.pdf', tenantId: 'tenant-a' }),
    ).resolves.toBe('https://signed.example.test/object');
  });

  it('configures lifecycle transition and expiration rules', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });
    const send = vi.fn().mockResolvedValue({});
    Object.defineProperty(service, 'client', {
      value: { send } satisfies Pick<S3Client, 'send'>,
    });

    await service.configureLifecycle([
      {
        name: 'retention-default',
        transitionToIaDays: 30,
        transitionToGlacierDays: 180,
        expirationDays: 3650,
        prefix: 'tenants/',
      },
    ]);

    const command = send.mock.calls[0]?.[0] as CommandWithInput<PutBucketLifecycleConfigurationCommandInput>;
    expect(command).toBeInstanceOf(PutBucketLifecycleConfigurationCommand);
    expect(command.input).toEqual({
      Bucket: 'stynx-docs-prod-us-east-1',
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'retention-default',
            Status: 'Enabled',
            Filter: { Prefix: 'tenants/' },
            Transitions: [
              { Days: 30, StorageClass: 'STANDARD_IA' },
              { Days: 180, StorageClass: 'GLACIER' },
            ],
            Expiration: { Days: 3650 },
          },
        ],
      },
    });
  });

  it('configures empty lifecycle filters when optional lifecycle fields are absent', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });
    const send = vi.fn().mockResolvedValue({});
    Object.defineProperty(service, 'client', { value: { send } satisfies Pick<S3Client, 'send'> });

    await service.configureLifecycle([{ name: 'empty-rule' }]);

    const command = send.mock.calls[0]?.[0] as CommandWithInput<PutBucketLifecycleConfigurationCommandInput>;
    expect(command.input.LifecycleConfiguration?.Rules?.[0]).toEqual({
      ID: 'empty-rule',
      Status: 'Enabled',
      Filter: {},
      Transitions: [],
    });
  });

  it('applies object-lock retention to a specific object version', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });
    const send = vi.fn().mockResolvedValue({});
    Object.defineProperty(service, 'client', {
      value: { send } satisfies Pick<S3Client, 'send'>,
    });

    await service.applyObjectLock('tenant-a/docs/one.pdf', 'version-1', {
      mode: 'COMPLIANCE',
      retainDays: 7,
    });

    const command = send.mock.calls[0]?.[0] as CommandWithInput<PutObjectRetentionCommandInput>;
    expect(command).toBeInstanceOf(PutObjectRetentionCommand);
    expect(command.input.Bucket).toBe('stynx-docs-prod-us-east-1');
    expect(command.input.Key).toBe('tenant-a/docs/one.pdf');
    expect(command.input.VersionId).toBe('version-1');
    expect(command.input.Retention?.Mode).toBe('COMPLIANCE');
    expect(command.input.Retention?.RetainUntilDate?.toISOString()).toBe('2026-05-03T12:00:00.000Z');
  });

  describe('presignUpload', () => {
    it('returns a signed PUT URL with content-type + sha256 + KMS metadata', async () => {
      const service = new S3Service({
        environment: 'prod',
        region: 'us-east-1',
        kmsAlias: 'stynx-docs',
        collections: {},
      });
      const result = await service.presignUpload({
        key: 'tenant-a/docs/file.pdf',
        contentType: 'application/pdf',
        checksumSha256: 'abc123',
      });
      expect(result.method).toBe('PUT');
      expect(result.url).toBe('https://signed.example.test/object');
      expect(result.headers['content-type']).toBe('application/pdf');
      expect(result.headers['x-amz-meta-sha256']).toBe('abc123');
      expect(result.headers['x-amz-server-side-encryption']).toBe('aws:kms');
      expect(result.headers['x-amz-server-side-encryption-aws-kms-key-id']).toBe('alias/stynx-docs');
      expect(result.expiresInSeconds).toBe(300);

      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(PutObjectCommand),
        { expiresIn: 300 },
      );
      const command = (getSignedUrl as Mock).mock.calls[0]?.[1] as PutObjectCommand;
      expect(command.input).toMatchObject({
        Bucket: 'stynx-docs-prod-us-east-1',
        Key: 'tenant-a/docs/file.pdf',
        ContentType: 'application/pdf',
        Metadata: { sha256: 'abc123' },
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: 'alias/stynx-docs',
      });
    });

    it('honors caller-specified expiresInSeconds', async () => {
      const service = new S3Service({
        environment: 'prod',
        region: 'us-east-1',
        kmsAlias: 'stynx-docs',
        collections: {},
        uploadExpiresInSeconds: 600,
      });
      const result = await service.presignUpload({
        key: 'k',
        contentType: 'text/plain',
        checksumSha256: 'sha',
        expiresInSeconds: 30,
      });
      expect(result.expiresInSeconds).toBe(30);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(PutObjectCommand),
        { expiresIn: 30 },
      );
    });
  });

  describe('presignDownload (single call)', () => {
    it('returns a signed URL with content-disposition + default expiry', async () => {
      const service = new S3Service({
        environment: 'prod',
        region: 'us-east-1',
        kmsAlias: 'stynx-docs',
        collections: {},
      });
      const result = await service.presignDownload({
        key: 'tenant-a/docs/file.pdf',
        filename: 'report.pdf',
      });
      expect(result.url).toBe('https://signed.example.test/object');
      expect(result.expiresInSeconds).toBe(300);
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(GetObjectCommand),
        { expiresIn: 300 },
      );
      const cmd = (getSignedUrl as Mock).mock.calls[0]?.[1] as GetObjectCommand;
      expect(cmd.input.Bucket).toBe('stynx-docs-prod-us-east-1');
      expect(cmd.input.Key).toBe('tenant-a/docs/file.pdf');
      expect(cmd.input.ResponseContentDisposition).toBe('attachment; filename="report.pdf"');
    });
  });

  it('bucket() returns the resolved bucket name', () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'k',
      collections: {},
    });
    expect(service.bucket()).toBe('stynx-docs-prod-us-east-1');
  });

  it('accepts explicit bucketName that matches the expected pattern', () => {
    const service = new S3Service({
      environment: 'dev',
      region: 'us-east-1',
      kmsAlias: 'k',
      bucketName: 'stynx-docs-dev-us-east-1',
      collections: {},
    });
    expect(service.bucket()).toBe('stynx-docs-dev-us-east-1');
  });

  it('passes endpoint and path-style client options and supports custom default expiries', async () => {
    const service = new S3Service({
      environment: 'dev',
      region: 'us-east-1',
      kmsAlias: 'k',
      collections: {},
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
      uploadExpiresInSeconds: 111,
      downloadExpiresInSeconds: 222,
    });

    await expect(service.presignUpload({ key: 'k', contentType: 'text/plain', checksumSha256: 'sha' })).resolves.toMatchObject({
      expiresInSeconds: 111,
    });
    await expect(service.presignDownload({ key: 'k', filename: 'file.txt' })).resolves.toMatchObject({
      expiresInSeconds: 222,
    });
  });

  it('heads objects and deletes object versions or the base object fallback', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ContentType: 'application/pdf',
        ContentLength: 10,
        Metadata: { sha256: 'abc' },
        VersionId: 'v1',
      })
      .mockResolvedValueOnce({
        Versions: [{ Key: 'key', VersionId: 'v1' }, { Key: 'other', VersionId: 'v2' }],
        DeleteMarkers: [{ Key: 'key', VersionId: 'd1' }],
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ Versions: [], DeleteMarkers: [] })
      .mockResolvedValueOnce({});
    Object.defineProperty(service, 'client', { value: { send } satisfies Pick<S3Client, 'send'> });

    await expect(service.headObject('key')).resolves.toEqual({
      contentType: 'application/pdf',
      contentLength: 10,
      metadata: { sha256: 'abc' },
      versionId: 'v1',
    });
    await service.deleteAllVersions('key');
    await service.deleteAllVersions('missing-key');

    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(ListObjectVersionsCommand);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectsCommand);
    expect(send.mock.calls[4]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });

  it('omits absent object metadata fields and deletes unversioned matches', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        Versions: [{ Key: 'key' }],
        DeleteMarkers: [{ Key: 'key' }],
      })
      .mockResolvedValueOnce({});
    Object.defineProperty(service, 'client', { value: { send } satisfies Pick<S3Client, 'send'> });

    await expect(service.headObject('key')).resolves.toEqual({});
    await service.deleteAllVersions('key');

    const command = send.mock.calls[2]?.[0] as DeleteObjectsCommand;
    expect(command).toBeInstanceOf(DeleteObjectsCommand);
    expect(command.input.Delete?.Objects).toEqual([{ Key: 'key' }, { Key: 'key' }]);
  });

  it('deletes matching delete markers when version listings are omitted', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        DeleteMarkers: [{ Key: 'key', VersionId: 'deleted-v1' }],
      })
      .mockResolvedValueOnce({});
    Object.defineProperty(service, 'client', { value: { send } satisfies Pick<S3Client, 'send'> });

    await service.deleteAllVersions('key');

    const command = send.mock.calls[1]?.[0] as DeleteObjectsCommand;
    expect(command).toBeInstanceOf(DeleteObjectsCommand);
    expect(command.input.Delete?.Objects).toEqual([{ Key: 'key', VersionId: 'deleted-v1' }]);
  });

  it('uses the default presign rate limit when no compliance override is configured', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });

    await expect(
      service.presignDownloadForTenant({ key: 'tenant-a/docs/file.pdf', tenantId: 'tenant-a' }),
    ).resolves.toBe('https://signed.example.test/object');
    expect(getSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(GetObjectCommand),
      { expiresIn: 300 },
    );
  });
});
