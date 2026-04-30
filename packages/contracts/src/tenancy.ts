import type { Principal } from './auth';

export interface TenantResolverContext {
  headerTenantId?: string;
  principal: Principal;
}

export interface TenantResolver {
  resolve(context: TenantResolverContext): Promise<string | undefined> | string | undefined;
}

export interface TenantEntitlementContext {
  principal: Principal;
  tenantId: string;
}

export interface TenantEntitlementPolicy {
  isEntitled(context: TenantEntitlementContext): Promise<boolean> | boolean;
}
