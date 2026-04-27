export interface PresignedUploadRequest {
  key: string;
  contentType?: string;
  expiresInSeconds?: number;
  metadata?: Record<string, string>;
}

export interface PresignedUploadResponse {
  method: 'PUT' | 'POST';
  url: string;
  headers?: Record<string, string>;
  fields?: Record<string, string>;
  expiresInSeconds: number;
}

export interface PresignedDownloadRequest {
  key: string;
  expiresInSeconds?: number;
  downloadFileName?: string;
}

export interface PresignedDownloadResponse {
  url: string;
  expiresInSeconds: number;
}

export interface ObjectStorageService {
  presignUpload(input: PresignedUploadRequest): Promise<PresignedUploadResponse>;
  presignDownload(input: PresignedDownloadRequest): Promise<PresignedDownloadResponse>;
  exists(key: string): Promise<boolean>;
  delete?(key: string): Promise<void>;
}

export interface DocumentMetadataRecord {
  id: string;
  storageKey: string;
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
  uploadedBy?: string;
  uploadedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentMetadataRepository {
  save(record: DocumentMetadataRecord): Promise<DocumentMetadataRecord>;
  getById(id: string): Promise<DocumentMetadataRecord | null>;
  deleteById(id: string): Promise<void>;
}
