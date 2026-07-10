import { InjectionToken } from '@angular/core';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import type { StynxTrashAdapter, StynxTrashKindConfig, StynxTrashOptions } from './types';

export const STYNX_DEFAULT_TRASH_KINDS: StynxTrashKindConfig[] = [
  { kind: 'record', label: 'Records' },
  { kind: 'work-item', label: 'Work items' },
  { kind: 'document', label: 'Documents' },
];

export const STYNX_TRASH_CLIENT = new InjectionToken<StynxSdkClient>('STYNX_TRASH_CLIENT');

export const STYNX_TRASH_OPTIONS = new InjectionToken<StynxTrashOptions>('STYNX_TRASH_OPTIONS', {
  providedIn: 'root',
  factory: () => ({ kinds: STYNX_DEFAULT_TRASH_KINDS }),
});

export const STYNX_TRASH_ADAPTER = new InjectionToken<StynxTrashAdapter>('STYNX_TRASH_ADAPTER');
