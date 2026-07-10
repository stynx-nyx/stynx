import { Injectable, inject } from '@angular/core';
import type { Provider } from '@angular/core';
import { STYNX_ANGULAR_OPTIONS } from '@stynx-nyx/angular';
import {
  STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS,
  STYNX_MULTIPART_UPLOAD_OPTIONS,
  STYNX_UPLOAD_EXECUTOR,
} from './tokens';
import type {
  StynxMultipartUploadChunk,
  StynxMultipartUploadCompleteRequest,
  StynxMultipartUploadExecutorOptions,
  StynxMultipartUploadInitiateRequest,
  StynxMultipartUploadInitiateResponse,
  StynxMultipartUploadStatusResponse,
  StynxMultipartUploadedPart,
  StynxUploadExecutor,
} from './types';
import { XhrUploadExecutor } from './xhr-upload.executor';

function trimEdgeSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function mergeOptions(
  defaults: StynxMultipartUploadExecutorOptions,
  overrides: Partial<StynxMultipartUploadExecutorOptions> | undefined,
): StynxMultipartUploadExecutorOptions {
  return {
    ...defaults,
    ...overrides,
  };
}

@Injectable()
export class MultipartUploadExecutor implements StynxUploadExecutor {
  private readonly angularOptions = inject(STYNX_ANGULAR_OPTIONS);
  private readonly options = inject(STYNX_MULTIPART_UPLOAD_OPTIONS);
  private readonly singlePartExecutor = inject(XhrUploadExecutor, { optional: true }) ?? new XhrUploadExecutor();

  async upload(
    url: string,
    file: File,
    headers: Record<string, string>,
    onProgress: (value: number) => void,
  ): Promise<void> {
    if (file.size <= this.options.chunkThreshold) {
      await this.singlePartExecutor.upload(url, file, headers, onProgress);
      return;
    }

    const chunkCount = Math.ceil(file.size / this.options.chunkSize);
    const init = await this.initiate(url, file, headers, chunkCount);
    const completed = new Map<number, StynxMultipartUploadedPart>();
    onProgress(0);

    await this.uploadChunks(file, init, headers, completed, onProgress);
    await this.complete(init, completed);
    onProgress(100);
  }

  private async initiate(
    uploadUrl: string,
    file: File,
    headers: Record<string, string>,
    chunkCount: number,
  ): Promise<StynxMultipartUploadInitiateResponse> {
    const body: StynxMultipartUploadInitiateRequest = {
      uploadUrl,
      filename: file.name,
      mimeType: file.type,
      byteSize: file.size,
      chunkSize: this.options.chunkSize,
      chunkCount,
      headers,
    };
    const response = await fetch(`${this.storageBaseUrl()}/uploads/initiate-multipart`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Multipart upload initiation failed with status ${response.status}`);
    }
    return response.json() as Promise<StynxMultipartUploadInitiateResponse>;
  }

  private async uploadChunks(
    file: File,
    init: StynxMultipartUploadInitiateResponse,
    uploadHeaders: Record<string, string>,
    completed: Map<number, StynxMultipartUploadedPart>,
    onProgress: (value: number) => void,
  ): Promise<void> {
    const chunks = [...init.chunks].sort((left, right) => left.partNumber - right.partNumber);
    let cursor = 0;

    const workers = Array.from(
      { length: Math.min(this.options.concurrency, chunks.length) },
      async () => {
        while (cursor < chunks.length) {
          const chunk = chunks[cursor];
          cursor += 1;
          if (!chunk || completed.has(chunk.partNumber)) {
            continue;
          }
          await this.uploadChunkWithRetry(file, init.uploadId, chunk, uploadHeaders, completed);
          this.emitProgress(file.size, chunks, completed, onProgress);
        }
      },
    );

    await Promise.all(workers);
  }

  private async uploadChunkWithRetry(
    file: File,
    uploadId: string,
    chunk: StynxMultipartUploadChunk,
    uploadHeaders: Record<string, string>,
    completed: Map<number, StynxMultipartUploadedPart>,
  ): Promise<void> {
    for (let attempt = 0; attempt <= this.options.retryAttempts; attempt += 1) {
      try {
        const part = await this.putChunk(file, chunk, uploadHeaders);
        completed.set(chunk.partNumber, part);
        return;
      } catch (error) {
        await this.refreshCompletedParts(uploadId, completed);
        if (completed.has(chunk.partNumber)) {
          return;
        }
        if (attempt >= this.options.retryAttempts) {
          throw error;
        }
      }
    }
  }

  private async putChunk(
    file: File,
    chunk: StynxMultipartUploadChunk,
    uploadHeaders: Record<string, string>,
  ): Promise<StynxMultipartUploadedPart> {
    const start = (chunk.partNumber - 1) * this.options.chunkSize;
    const body = file.slice(start, Math.min(start + this.options.chunkSize, file.size), file.type);
    const response = await fetch(chunk.url, {
      method: 'PUT',
      headers: {
        ...uploadHeaders,
        ...chunk.headers,
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`Multipart chunk ${chunk.partNumber} failed with status ${response.status}`);
    }
    const etag = response.headers.get('etag');
    return etag ? { partNumber: chunk.partNumber, etag } : { partNumber: chunk.partNumber };
  }

  private async refreshCompletedParts(
    uploadId: string,
    completed: Map<number, StynxMultipartUploadedPart>,
  ): Promise<void> {
    const response = await fetch(`${this.storageBaseUrl()}/uploads/${encodeURIComponent(uploadId)}`);
    if (!response.ok) {
      return;
    }
    const status = await response.json() as StynxMultipartUploadStatusResponse;
    for (const part of status.completedParts) {
      const normalized = typeof part === 'number' ? { partNumber: part } : part;
      completed.set(normalized.partNumber, normalized);
    }
  }

  private async complete(
    init: StynxMultipartUploadInitiateResponse,
    completed: Map<number, StynxMultipartUploadedPart>,
  ): Promise<void> {
    const body: StynxMultipartUploadCompleteRequest = {
      uploadId: init.uploadId,
      parts: [...completed.values()].sort((left, right) => left.partNumber - right.partNumber),
    };
    const response = await fetch(init.completeUrl ?? `${this.storageBaseUrl()}/uploads/complete-multipart`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Multipart upload completion failed with status ${response.status}`);
    }
  }

  private emitProgress(
    byteSize: number,
    chunks: StynxMultipartUploadChunk[],
    completed: Map<number, StynxMultipartUploadedPart>,
    onProgress: (value: number) => void,
  ): void {
    const completedBytes = chunks.reduce((total, chunk) => {
      if (!completed.has(chunk.partNumber)) {
        return total;
      }
      const start = (chunk.partNumber - 1) * this.options.chunkSize;
      return total + Math.min(this.options.chunkSize, byteSize - start);
    }, 0);
    onProgress(Math.min(99, Math.round((completedBytes / byteSize) * 100)));
  }

  private storageBaseUrl(): string {
    return `${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/storage`;
  }
}

export function provideStynxMultipartUploadExecutor(
  options?: Partial<StynxMultipartUploadExecutorOptions>,
): Provider[] {
  return [
    XhrUploadExecutor,
    MultipartUploadExecutor,
    {
      provide: STYNX_MULTIPART_UPLOAD_OPTIONS,
      useValue: mergeOptions(STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS, options),
    },
    {
      provide: STYNX_UPLOAD_EXECUTOR,
      useExisting: MultipartUploadExecutor,
    },
  ];
}
