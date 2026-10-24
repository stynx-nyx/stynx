import type {
  StynxMultipartUploadChunk,
  StynxMultipartUploadInitiateResponse,
  StynxMultipartUploadStatusResponse,
  StynxMultipartUploadedPart,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

function isChunk(value: unknown): value is StynxMultipartUploadChunk {
  return isRecord(value) && typeof value.partNumber === 'number' &&
    typeof value.url === 'string' &&
    (value.headers === undefined || isStringRecord(value.headers));
}

function isUploadedPart(value: unknown): value is StynxMultipartUploadedPart {
  return isRecord(value) && typeof value.partNumber === 'number' &&
    (value.etag === undefined || typeof value.etag === 'string');
}

function isInitiateResponse(value: unknown): value is StynxMultipartUploadInitiateResponse {
  return isRecord(value) && typeof value.uploadId === 'string' &&
    Array.isArray(value.chunks) && value.chunks.every(isChunk) &&
    (value.completeUrl === undefined || typeof value.completeUrl === 'string');
}

function isStatusResponse(value: unknown): value is StynxMultipartUploadStatusResponse {
  return isRecord(value) && typeof value.uploadId === 'string' &&
    Array.isArray(value.completedParts) &&
    value.completedParts.every((part: unknown) => typeof part === 'number' || isUploadedPart(part));
}

export function validateMultipartInitiateResponse(value: unknown): StynxMultipartUploadInitiateResponse {
  if (!isInitiateResponse(value)) throw new Error('Invalid multipart initiation response');
  return value;
}

export function validateMultipartStatusResponse(value: unknown): StynxMultipartUploadStatusResponse {
  if (!isStatusResponse(value)) throw new Error('Invalid multipart status response');
  return value;
}
