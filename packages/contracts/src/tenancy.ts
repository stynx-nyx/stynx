import type { Principal } from './auth.js';

export interface TenantResolverContext {
  headerTenantId?: string;
  host?: string;
  path?: string;
  principal: Principal;
}

export const STYNX_PUBLIC_TENANT_ROUTE = Symbol('STYNX_PUBLIC_TENANT_ROUTE');
export const STYNX_PUBLIC_TENANT_OPTIONS = Symbol('STYNX_PUBLIC_TENANT_OPTIONS');
export const STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL = Symbol(
  'STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL',
);
export const STYNX_VERIFIED_TENANT_ID = Symbol('STYNX_VERIFIED_TENANT_ID');
/** Read-only completion proof emitted by the STYNX tenancy interceptor. */
export const STYNX_RESOLVED_TENANT_COMMAND_CONTEXT = Symbol(
  'STYNX_RESOLVED_TENANT_COMMAND_CONTEXT',
);
export interface ResolvedTenantCommandContext {
  tenantId: string;
  actorId: string;
  mode: 'protected' | 'nominal' | 'verified';
}
export interface ResolvedTenantCommandContextPort {
  get(request: object): ResolvedTenantCommandContext | undefined;
}
export interface PublicTenantRouteOptions {
  optionalAuth?: boolean;
}

export function hasPublicTenantRoute(controller: { prototype: object }): boolean {
  const getMetadata: unknown = Reflect.get(Reflect, 'getMetadata');
  if (typeof getMetadata !== 'function') {
    throw new TypeError(
      'Reflect.getMetadata must be installed before checking public tenant routes',
    );
  }
  const metadata = (target: object): unknown =>
    Reflect.apply(getMetadata, Reflect, [STYNX_PUBLIC_TENANT_ROUTE, target]);
  if (metadata(controller) !== undefined) return true;
  let prototype: object | null = controller.prototype;
  while (prototype && prototype !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const handler: unknown = Object.getOwnPropertyDescriptor(prototype, name)?.value;
      if (typeof handler === 'function' && metadata(handler) !== undefined) return true;
    }
    prototype = Reflect.getPrototypeOf(prototype);
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
