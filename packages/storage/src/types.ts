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
