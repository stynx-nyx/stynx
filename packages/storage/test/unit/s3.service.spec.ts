import {
  GetObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectRetentionCommand,
  type PutBucketLifecycleConfigurationCommandInput,
  type PutObjectRetentionCommandInput,
  type S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageValidationError } from '../../src/errors';
import { S3Service } from '../../src/s3.service';

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://signed.example.test/object'),
}));

type CommandWithInput<TInput> = {
  input: TInput;
};

describe('S3Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-04-26T12:00:00.000Z').getTime());
  });

  afterEach(() => {
    jest.restoreAllMocks();
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
    ).rejects.toBeInstanceOf(StorageValidationError);

    expect(getSignedUrl).toHaveBeenCalledTimes(2);
    const signedCommand = (getSignedUrl as jest.Mock).mock.calls[0]?.[1];
    expect(signedCommand).toBeInstanceOf(GetObjectCommand);
  });

  it('configures lifecycle transition and expiration rules', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });
    const send = jest.fn().mockResolvedValue({});
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

  it('applies object-lock retention to a specific object version', async () => {
    const service = new S3Service({
      environment: 'prod',
      region: 'us-east-1',
      kmsAlias: 'stynx-docs',
      collections: {},
    });
    const send = jest.fn().mockResolvedValue({});
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
});
