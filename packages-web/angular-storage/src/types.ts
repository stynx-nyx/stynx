export interface StynxDocumentUploadInitRequest {
  collection: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
}

export interface StynxDocumentUploadInitResponse {
  id: string;
  s3Key: string;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresInSeconds: number;
  };
}

export type StynxDocumentScanStatus = 'pending' | 'scanning' | 'completed' | 'quarantined' | 'failed';

export interface StynxDocumentScanEvent {
  id: string;
  status: StynxDocumentScanStatus;
  checkedAt?: string;
  message?: string;
}

export interface StynxDocumentScanStatusOptions {
  pollIntervalMs?: number;
}

export interface StynxDocumentCompleteResponse {
  id: string;
  scanStatus: StynxDocumentScanStatus;
}

export interface StynxDocumentDownloadResponse {
  id: string;
  url: string;
  expiresInSeconds: number;
}

export interface StynxDocumentDownloadProgressEvent {
  loadedBytes: number;
  totalBytes: number | null;
  percentage: number;
}

export interface StynxDocumentDownloadCompletedEvent {
  id: string;
  filename: string;
  byteSize: number;
}

export interface StynxDocumentListItem {
  id: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  scanStatus: string;
}

export interface StynxUploadExecutor {
  upload(
    url: string,
    file: File,
    headers: Record<string, string>,
    onProgress: (value: number) => void,
  ): Promise<void>;
}

export interface StynxMultipartUploadExecutorOptions {
  chunkThreshold: number;
  chunkSize: number;
  concurrency: number;
  retryAttempts: number;
}

export interface StynxMultipartUploadInitiateRequest {
  uploadUrl: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  chunkSize: number;
  chunkCount: number;
  headers: Record<string, string>;
}

export interface StynxMultipartUploadChunk {
  partNumber: number;
  url: string;
  headers?: Record<string, string>;
}

export interface StynxMultipartUploadInitiateResponse {
  uploadId: string;
  chunks: StynxMultipartUploadChunk[];
  completeUrl?: string;
}

export interface StynxMultipartUploadedPart {
  partNumber: number;
  etag?: string;
}

export interface StynxMultipartUploadStatusResponse {
  uploadId: string;
  completedParts: Array<number | StynxMultipartUploadedPart>;
}

export interface StynxMultipartUploadCompleteRequest {
  uploadId: string;
  parts: StynxMultipartUploadedPart[];
}

export interface StynxMultipartUploadCompleteResponse {
  uploadId: string;
  completed: boolean;
}

export interface StynxDocumentUploadCompletedEvent {
  id: string;
  filename: string;
  scanStatus: StynxDocumentScanStatus;
}
