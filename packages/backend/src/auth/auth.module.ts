import { DynamicModule, Module, Provider } from '@nestjs/common';
import type { PrincipalMapper, TenantEntitlementPolicy, TenantResolver, TokenVerifier } from '@stynx-nyx/contracts';
import { AuthContextGuard } from './auth-context.guard';
import {
  STYNX_PRINCIPAL_MAPPER,
  STYNX_TENANT_ENTITLEMENT_POLICY,
  STYNX_TENANT_RESOLVER,
  STYNX_TOKEN_VERIFIER,
} from './constants';

export interface StynxAuthModuleOptions {
  tokenVerifier: TokenVerifier;
  principalMapper?: PrincipalMapper;
  tenantResolver?: TenantResolver;
  tenantEntitlementPolicy?: TenantEntitlementPolicy;
}

@Module({})
export class StynxAuthModule {
  static forRoot(options: StynxAuthModuleOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: STYNX_TOKEN_VERIFIER, useValue: options.tokenVerifier },
      AuthContextGuard,
    ];

    if (options.principalMapper) {
      providers.push({ provide: STYNX_PRINCIPAL_MAPPER, useValue: options.principalMapper });
    }
    if (options.tenantResolver) {
      providers.push({ provide: STYNX_TENANT_RESOLVER, useValue: options.tenantResolver });
    }
    if (options.tenantEntitlementPolicy) {
      providers.push({ provide: STYNX_TENANT_ENTITLEMENT_POLICY, useValue: options.tenantEntitlementPolicy });
    }

    return {
      module: StynxAuthModule,
      providers,
      exports: providers,
    };
  }
}
