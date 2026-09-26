import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef, ModulesContainer } from '@nestjs/core';
import { STYNX_PUBLIC_TENANT_OPTIONS, hasPublicTenantRoute } from '@stynx-nyx/contracts';

@Injectable()
export class PublicTenantBootstrap implements OnApplicationBootstrap {
  constructor(private readonly modules: ModulesContainer, private readonly moduleRef: ModuleRef) {}

  onApplicationBootstrap(): void {
    for (const module of this.modules.values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype;
        if (!controller) continue;
        if (hasPublicTenantRoute(controller)) {
          let options: unknown;
          try { options = this.moduleRef.get(STYNX_PUBLIC_TENANT_OPTIONS, { strict: false }); } catch { /* absent provider */ }
          if (!options) throw new Error('PublicTenantRoute requires StynxTenancyModule publicTenant options');
        }
      }
    }
  }
}
