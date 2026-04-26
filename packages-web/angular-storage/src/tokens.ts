import { InjectionToken } from '@angular/core';
import type { StynxUploadExecutor } from './types';

export const STYNX_UPLOAD_EXECUTOR = new InjectionToken<StynxUploadExecutor>('STYNX_UPLOAD_EXECUTOR');
