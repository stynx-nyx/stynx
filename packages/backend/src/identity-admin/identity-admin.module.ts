import { DynamicModule, Module, Provider } from '@nestjs/common';
import type { IdentityAdminAdapter, IdentityLocalSyncAdapter } from '@stynx-nyx/contracts';
import { STYNX_IDENTITY_ADMIN_ADAPTER, STYNX_IDENTITY_LOCAL_SYNC_ADAPTER } from './constants.js';
import { PecIdentityAdminFacade, PormIdentityAdminFacade } from './integration-facades.js';
import { IdentityAdminService } from './identity-admin.service.js';

export interface StynxIdentityAdminModuleOptions {
  adapter: IdentityAdminAdapter;
  localSyncAdapter?: IdentityLocalSyncAdapter;
}

@Module({})
export class StynxIdentityAdminModule {
  static forRoot(options: StynxIdentityAdminModuleOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: STYNX_IDENTITY_ADMIN_ADAPTER,
        useValue: options.adapter,
      },
      IdentityAdminService,
      PormIdentityAdminFacade,
      PecIdentityAdminFacade,
    ];

    if (options.localSyncAdapter) {
      providers.push({
        provide: STYNX_IDENTITY_LOCAL_SYNC_ADAPTER,
        useValue: options.localSyncAdapter,
      });
    }

    return {
      module: StynxIdentityAdminModule,
      providers,
      exports: providers,
    };
  }
}
