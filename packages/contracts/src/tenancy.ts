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

export function hasPublicTenantRoute(controller: { prototype: object }): boolean {
  const metadata = Reflect as typeof Reflect & { getMetadata(key: symbol, target: object): unknown };
  if (metadata.getMetadata(STYNX_PUBLIC_TENANT_ROUTE, controller) !== undefined) return true;
  let prototype: object | null = controller.prototype;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const handler = Object.getOwnPropertyDescriptor(prototype, name)?.value;
      if (typeof handler === 'function' && metadata.getMetadata(STYNX_PUBLIC_TENANT_ROUTE, handler) !== undefined) return true;
    }
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return false;
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
