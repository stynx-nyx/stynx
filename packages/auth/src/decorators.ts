import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STYNX_PUBLIC_TENANT_ROUTE, type PublicTenantRouteOptions } from '@stynx-nyx/contracts';

export const STYNX_PUBLIC_ROUTE = Symbol('STYNX_PUBLIC_ROUTE');
export const STYNX_SYSTEM_ROUTE = Symbol('STYNX_SYSTEM_ROUTE');
export const STYNX_READONLY_ROUTE = Symbol('STYNX_READONLY_ROUTE');
export const STYNX_PERMISSION_ROUTE = Symbol('STYNX_PERMISSION_ROUTE');

export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_PUBLIC_ROUTE, true);
}

export function PublicTenantRoute(options: PublicTenantRouteOptions = {}): MethodDecorator & ClassDecorator {
  return applyDecorators(SetMetadata(STYNX_PUBLIC_ROUTE, true), SetMetadata(STYNX_PUBLIC_TENANT_ROUTE, options));
}

export function System(): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_SYSTEM_ROUTE, true);
}

export function ReadOnly(): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_READONLY_ROUTE, true);
}

export function Permission(key: string): MethodDecorator & ClassDecorator {
  return SetMetadata(STYNX_PERMISSION_ROUTE, key);
}
