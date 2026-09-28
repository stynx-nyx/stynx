import type { Principal } from './auth';

export interface TenantResolverContext {
  headerTenantId?: string;
  host?: string;
  path?: string;
  principal: Principal;
}

export const STYNX_PUBLIC_TENANT_ROUTE = Symbol('STYNX_PUBLIC_TENANT_ROUTE');
export const STYNX_PUBLIC_TENANT_OPTIONS = Symbol('STYNX_PUBLIC_TENANT_OPTIONS');
export const STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL = Symbol('STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL');
export const STYNX_VERIFIED_TENANT_ID = Symbol('STYNX_VERIFIED_TENANT_ID');
/** Read-only completion proof emitted by the STYNX tenancy interceptor. */
export const STYNX_RESOLVED_TENANT_COMMAND_CONTEXT = Symbol('STYNX_RESOLVED_TENANT_COMMAND_CONTEXT');
export interface ResolvedTenantCommandContext {
  tenantId: string;
  actorId: string;
  mode: 'protected' | 'nominal' | 'verified';
}
export interface ResolvedTenantCommandContextPort {
  get(request: object): ResolvedTenantCommandContext | undefined;
}
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
