import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Inject, Injectable } from '@nestjs/common';
import { STYNX_PRIVACY_OPTIONS } from './tokens';
import type { PrivacyObjectStore, StynxPrivacyModuleOptions } from './types';

@Injectable()
export class PrivacyObjectStoreService implements PrivacyObjectStore {
  private readonly client: S3Client;
  private readonly bucketName: string;

  constructor(
    @Inject(STYNX_PRIVACY_OPTIONS)
    private readonly options: StynxPrivacyModuleOptions,
  ) {
    this.bucketName = options.bucketName ?? `stynx-privacy-${options.environment}`;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle !== undefined ? { forcePathStyle: options.forcePathStyle } : {}),
    });
  }

  async putObject(input: {
    key: string;
    body: Buffer;
    contentType: string;
    expiresAt?: Date;
  }): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ...(input.expiresAt ? { Expires: input.expiresAt } : {}),
    }));
  }

  async presignDownload(input: { key: string; expiresInSeconds: number }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: input.key,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }
}
