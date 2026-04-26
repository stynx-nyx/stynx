import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectRetentionCommand,
  PutObjectCommand,
  S3Client,
  type LifecycleRule,
  type ObjectLockRetention,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { StorageValidationError } from './errors';
import { STYNX_STORAGE_OPTIONS } from './tokens';
import type {
  HeadedObject,
  S3LifecycleRule,
  S3ObjectLockConfig,
  StynxStorageModuleOptions,
} from './types';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly uploadExpiresInSeconds: number;
  private readonly downloadExpiresInSeconds: number;
  private readonly presignCounts = new Map<string, { count: number; windowStart: number }>();

  constructor(
    @Inject(STYNX_STORAGE_OPTIONS)
    private readonly options: StynxStorageModuleOptions,
  ) {
    this.bucketName = options.bucketName ?? `stynx-docs-${options.environment}-${options.region}`;
    const expected = `stynx-docs-${options.environment}-${options.region}`;
    if (this.bucketName !== expected) {
      throw new StorageValidationError('Bucket name does not match the required environment pattern', {
        bucketName: this.bucketName,
        expected,
      });
    }

    this.client = new S3Client({
      region: options.region,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle !== undefined ? { forcePathStyle: options.forcePathStyle } : {}),
    });
    this.uploadExpiresInSeconds = options.uploadExpiresInSeconds ?? 300;
    this.downloadExpiresInSeconds = options.downloadExpiresInSeconds ?? 300;
  }

  bucket(): string {
    return this.bucketName;
  }

  async presignUpload(input: {
    key: string;
    contentType: string;
    checksumSha256: string;
    expiresInSeconds?: number;
  }) {
    const expiresInSeconds = input.expiresInSeconds ?? this.uploadExpiresInSeconds;
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
      ContentType: input.contentType,
      Metadata: {
        sha256: input.checksumSha256,
      },
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: `alias/${this.options.kmsAlias}`,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    return {
      method: 'PUT' as const,
      url,
      headers: {
        'content-type': input.contentType,
        'x-amz-meta-sha256': input.checksumSha256,
        'x-amz-server-side-encryption': 'aws:kms',
        'x-amz-server-side-encryption-aws-kms-key-id': `alias/${this.options.kmsAlias}`,
      },
      expiresInSeconds,
    };
  }

  async presignDownload(input: { key: string; filename: string; expiresInSeconds?: number }) {
    const expiresInSeconds = input.expiresInSeconds ?? this.downloadExpiresInSeconds;
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
      ResponseContentDisposition: `attachment; filename="${input.filename}"`,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
    return { url, expiresInSeconds };
  }

  async presignDownloadForTenant(input: {
    key: string;
    tenantId: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    this.checkPresignRateLimit(input.tenantId);
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: input.expiresInSeconds ?? this.downloadExpiresInSeconds,
    });
  }

  async configureLifecycle(rules: S3LifecycleRule[]): Promise<void> {
    const awsRules: LifecycleRule[] = rules.map((rule) => ({
      ID: rule.name,
      Status: 'Enabled',
      ...(rule.prefix !== undefined ? { Filter: { Prefix: rule.prefix } } : { Filter: {} }),
      Transitions: [
        ...(rule.transitionToIaDays !== undefined
          ? [{ Days: rule.transitionToIaDays, StorageClass: 'STANDARD_IA' as const }]
          : []),
        ...(rule.transitionToGlacierDays !== undefined
          ? [{ Days: rule.transitionToGlacierDays, StorageClass: 'GLACIER' as const }]
          : []),
      ],
      ...(rule.expirationDays !== undefined ? { Expiration: { Days: rule.expirationDays } } : {}),
    }));

    await this.client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: this.bucketName,
        LifecycleConfiguration: { Rules: awsRules },
      }),
    );
  }

  async applyObjectLock(
    key: string,
    versionId: string,
    config: S3ObjectLockConfig,
  ): Promise<void> {
    const retention: ObjectLockRetention = {
      Mode: config.mode,
      RetainUntilDate: new Date(Date.now() + config.retainDays * 24 * 60 * 60 * 1000),
    };

    await this.client.send(
      new PutObjectRetentionCommand({
        Bucket: this.bucketName,
        Key: key,
        VersionId: versionId,
        Retention: retention,
      }),
    );
  }

  async headObject(key: string): Promise<HeadedObject> {
    const response = await this.client.send(
      new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
    return {
      ...(response.ContentType ? { contentType: response.ContentType } : {}),
      ...(typeof response.ContentLength === 'number' ? { contentLength: response.ContentLength } : {}),
      ...(response.Metadata ? { metadata: response.Metadata } : {}),
      ...(response.VersionId ? { versionId: response.VersionId } : {}),
    };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
  }

  async deleteAllVersions(key: string): Promise<void> {
    const listed = await this.client.send(
      new ListObjectVersionsCommand({
        Bucket: this.bucketName,
        Prefix: key,
      }),
    );
    const objects = [
      ...(listed.Versions ?? []).filter((entry) => entry.Key === key).map((entry) => ({
        Key: key,
        ...(entry.VersionId ? { VersionId: entry.VersionId } : {}),
      })),
      ...(listed.DeleteMarkers ?? []).filter((entry) => entry.Key === key).map((entry) => ({
        Key: key,
        ...(entry.VersionId ? { VersionId: entry.VersionId } : {}),
      })),
    ];

    if (objects.length === 0) {
      await this.deleteObject(key);
      return;
    }

    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucketName,
        Delete: { Objects: objects },
      }),
    );
  }

  private checkPresignRateLimit(tenantId: string): void {
    const limit = this.options.compliance?.presignRateLimit?.maxPerMinute ?? 60;
    const now = Date.now();
    const windowMs = 60_000;
    const entry = this.presignCounts.get(tenantId);
    if (!entry || now - entry.windowStart >= windowMs) {
      this.presignCounts.set(tenantId, { count: 1, windowStart: now });
      return;
    }
    if (entry.count >= limit) {
      throw new StorageValidationError(
        `Presign rate limit exceeded for tenant ${tenantId}: ${limit} per minute`,
        { tenantId, limit },
      );
    }
    entry.count += 1;
  }
}

export { S3Service as S3ObjectStorageService };
