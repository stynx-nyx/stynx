import type { Principal } from './auth';

export interface TenantResolverContext {
  headerTenantId?: string;
  host?: string;
  path?: string;
  principal: Principal;
}

export const STYNX_PUBLIC_TENANT_ROUTE = Symbol('STYNX_PUBLIC_TENANT_ROUTE');
export const STYNX_PUBLIC_TENANT_OPTIONS = Symbol('STYNX_PUBLIC_TENANT_OPTIONS');
export interface PublicTenantRouteOptions { optionalAuth?: boolean }

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
