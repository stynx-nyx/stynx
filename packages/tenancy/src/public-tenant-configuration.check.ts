import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { hasPublicTenantRoute } from '@stynx-nyx/contracts';
import { STYNX_TENANCY_OPTIONS } from './tokens.js';
import type { ResolvedStynxTenancyModuleOptions } from './types.js';

@Injectable()
export class PublicTenantConfigurationCheck implements OnApplicationBootstrap {
  constructor(
    private readonly modules: ModulesContainer,
    @Inject(STYNX_TENANCY_OPTIONS) private readonly options: ResolvedStynxTenancyModuleOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (this.options.publicTenant) return;
    for (const module of this.modules.values()) {
      for (const wrapper of module.controllers.values()) {
        const controller = wrapper.metatype;
        if (!controller) continue;
        if (hasPublicTenantRoute(controller)) throw new Error('PublicTenantRoute requires StynxTenancyModule publicTenant options');
      }
    }
  }
}
