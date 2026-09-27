import 'reflect-metadata';
import type { ModulesContainer } from '@nestjs/core';
import { STYNX_PUBLIC_TENANT_ROUTE } from '@stynx-nyx/contracts';
import { PublicTenantConfigurationCheck } from '../../src/public-tenant-configuration.check';

const PUBLIC_TENANT = {
  resolveHost: () => undefined,
  actorId: '018f53e4-28a1-7cd8-a0ff-5b22c3a07112',
};

function modulesWith(...controllers: Array<{ metatype?: unknown }>): ModulesContainer {
  return new Map([['AppModule', { controllers: new Map(controllers.map((wrapper, index) => [`c${index}`, wrapper])) }]]) as unknown as ModulesContainer;
}

class PlainController {
  list(): void {}
}

class PublicHandlerController {
  show(): void {}
}
Reflect.defineMetadata(STYNX_PUBLIC_TENANT_ROUTE, true, PublicHandlerController.prototype.show);

class PublicClassController {}
Reflect.defineMetadata(STYNX_PUBLIC_TENANT_ROUTE, { optionalAuth: true }, PublicClassController);

describe('PublicTenantConfigurationCheck', () => {
  it('rejects a public tenant route when publicTenant options are not configured', () => {
    const check = new PublicTenantConfigurationCheck(modulesWith({ metatype: PlainController }, { metatype: PublicHandlerController }), {} as never);

    expect(() => check.onApplicationBootstrap()).toThrow('PublicTenantRoute requires StynxTenancyModule publicTenant options');
  });

  it('rejects a class-level public tenant route without publicTenant options', () => {
    const check = new PublicTenantConfigurationCheck(modulesWith({ metatype: PublicClassController }), {} as never);

    expect(() => check.onApplicationBootstrap()).toThrow('PublicTenantRoute requires StynxTenancyModule publicTenant options');
  });

  it('accepts public tenant routes once publicTenant options are configured', () => {
    const check = new PublicTenantConfigurationCheck(modulesWith({ metatype: PublicHandlerController }), { publicTenant: PUBLIC_TENANT } as never);

    expect(() => check.onApplicationBootstrap()).not.toThrow();
  });

  it('accepts applications without public tenant routes and skips wrappers without a metatype', () => {
    const check = new PublicTenantConfigurationCheck(modulesWith({ metatype: PlainController }, {}, { metatype: undefined }), {} as never);

    expect(() => check.onApplicationBootstrap()).not.toThrow();
  });
});
