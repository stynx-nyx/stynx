import { InjectionToken } from '@angular/core';
import type { TenancyOptions } from './types';

export const STYNX_TENANCY_OPTIONS = new InjectionToken<TenancyOptions>('STYNX_TENANCY_OPTIONS');
export const STYNX_TENANCY_WINDOW = new InjectionToken<Window | null>('STYNX_TENANCY_WINDOW');
