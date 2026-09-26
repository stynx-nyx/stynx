import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { STYNX_PUBLIC_TENANT_ROUTE } from '@stynx-nyx/contracts';
import { STYNX_TENANCY_OPTIONS } from './tokens';
import type { ResolvedStynxTenancyModuleOptions } from './types';

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
        const prototype = controller.prototype as object;
        const marked = Reflect.getMetadata(STYNX_PUBLIC_TENANT_ROUTE, controller) !== undefined ||
          Object.getOwnPropertyNames(prototype).some((name) => {
            const handler = Object.getOwnPropertyDescriptor(prototype, name)?.value;
            return typeof handler === 'function' && Reflect.getMetadata(STYNX_PUBLIC_TENANT_ROUTE, handler) !== undefined;
          });
        if (marked) throw new Error('PublicTenantRoute requires StynxTenancyModule publicTenant options');
      }
    }
  }
}
