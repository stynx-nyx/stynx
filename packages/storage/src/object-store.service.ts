import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ObjectStoreOptions {
  bucketName: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
  expiresAt?: Date;
}

export interface PresignObjectDownloadInput {
  key: string;
  expiresInSeconds: number;
}

export class StynxObjectStore {
  private readonly client: S3Client;

  constructor(private readonly options: ObjectStoreOptions) {
    this.client = new S3Client({
      region: options.region,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle !== undefined ? { forcePathStyle: options.forcePathStyle } : {}),
    });
  }

  async putObject(input: PutObjectInput): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucketName,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        ...(input.expiresAt ? { Expires: input.expiresAt } : {}),
      }),
    );
  }

  async presignDownload(input: PresignObjectDownloadInput): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.options.bucketName,
        Key: input.key,
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }
}
