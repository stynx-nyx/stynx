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

export interface StynxDocumentCompleteResponse {
  id: string;
  scanStatus: 'completed' | 'quarantined';
}

export interface StynxDocumentDownloadResponse {
  id: string;
  url: string;
  expiresInSeconds: number;
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

export interface StynxDocumentUploadCompletedEvent {
  id: string;
  filename: string;
  scanStatus: 'completed' | 'quarantined';
}
