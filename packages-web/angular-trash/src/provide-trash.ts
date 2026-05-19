import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { StynxSdkClient } from '@stynx-web/sdk';
import { SdkTrashAdapter } from './sdk-trash.adapter';
import {
  STYNX_DEFAULT_TRASH_KINDS,
  STYNX_TRASH_ADAPTER,
  STYNX_TRASH_CLIENT,
  STYNX_TRASH_OPTIONS,
} from './tokens';
import type { StynxTrashOptions } from './types';

export function provideStynxTrash(
  client: StynxSdkClient,
  options: Partial<StynxTrashOptions> = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: STYNX_TRASH_CLIENT,
      useValue: client,
    },
    {
      provide: STYNX_TRASH_OPTIONS,
      useValue: {
        kinds: options.kinds ?? STYNX_DEFAULT_TRASH_KINDS,
      },
    },
    SdkTrashAdapter,
    {
      provide: STYNX_TRASH_ADAPTER,
      useExisting: SdkTrashAdapter,
    },
  ]);
}
