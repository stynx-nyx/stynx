export interface StorageCollectionConfig {
  mimeAllowlist: string[];
  maxBytes: number;
  classificationDefault: string;
}

export interface StynxStorageModuleOptions {
  environment: string;
  region: string;
  kmsAlias: string;
  collections: Record<string, StorageCollectionConfig>;
  bucketName?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  uploadExpiresInSeconds?: number;
  downloadExpiresInSeconds?: number;
  compliance?: S3ComplianceOptions;
}

export interface InitiateDocumentInput {
  collection: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  classification?: string;
}

export interface InitiateDocumentResult {
  id: string;
  s3Key: string;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresInSeconds: number;
  };
}

export interface CompleteDocumentHeaders {
  contentType?: string;
  checksumSha256?: string;
}

export interface CompleteDocumentResult {
  id: string;
  scanStatus: 'completed' | 'quarantined';
}

export interface DownloadDocumentResult {
  id: string;
  url: string;
  expiresInSeconds: number;
}

export interface HeadedObject {
  contentType?: string;
  contentLength?: number;
  metadata?: Record<string, string>;
  versionId?: string;
}

export type S3ObjectLockMode = 'GOVERNANCE' | 'COMPLIANCE';

export interface S3ObjectLockConfig {
  /** Lock mode applied to newly uploaded objects. */
  mode: S3ObjectLockMode;
  /** Retention period in days. */
  retainDays: number;
}

export interface S3LifecycleRule {
  /** Human-readable name. Also used as the S3 rule ID. */
  name: string;
  /** Days after object creation to transition to S3 Standard-IA. */
  transitionToIaDays?: number;
  /** Days after object creation to transition to S3 Glacier. */
  transitionToGlacierDays?: number;
  /** Days after object creation to expire non-locked objects. */
  expirationDays?: number;
  /** Optional key prefix filter. If absent, applies to all objects. */
  prefix?: string;
}

export interface PresignRateLimitOptions {
  /** Max presign calls per tenant per minute. Default: 60. */
  maxPerMinute: number;
}

export interface S3ComplianceOptions {
  objectLock?: S3ObjectLockConfig;
  lifecycle?: S3LifecycleRule[];
  presignRateLimit?: PresignRateLimitOptions;
}
