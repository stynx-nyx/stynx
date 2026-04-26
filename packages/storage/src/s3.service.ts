import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { StorageValidationError } from './errors';
import { STYNX_STORAGE_OPTIONS } from './tokens';
import type { HeadedObject, StynxStorageModuleOptions } from './types';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly uploadExpiresInSeconds: number;
  private readonly downloadExpiresInSeconds: number;

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
}

export { S3Service as S3ObjectStorageService };
