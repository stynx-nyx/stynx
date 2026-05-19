import { InjectionToken } from '@angular/core';
import type { StynxMultipartUploadExecutorOptions, StynxUploadExecutor } from './types';

export const STYNX_UPLOAD_EXECUTOR = new InjectionToken<StynxUploadExecutor>('STYNX_UPLOAD_EXECUTOR');

export const STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS: StynxMultipartUploadExecutorOptions = {
  chunkThreshold: 16 * 1024 * 1024,
  chunkSize: 16 * 1024 * 1024,
  concurrency: 3,
  retryAttempts: 2,
};

export const STYNX_MULTIPART_UPLOAD_OPTIONS = new InjectionToken<StynxMultipartUploadExecutorOptions>(
  'STYNX_MULTIPART_UPLOAD_OPTIONS',
  {
    providedIn: 'root',
    factory: () => STYNX_DEFAULT_MULTIPART_UPLOAD_OPTIONS,
  },
);
