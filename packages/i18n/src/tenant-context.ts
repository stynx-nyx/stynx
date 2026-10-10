import { ForbiddenException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import { RequestContext, SystemContext } from '@stynx-nyx/core';
import { ActorContextMissingError, TenantContextMissingError } from '@stynx-nyx/data';
import { currentI18nHttpContext } from './http-context';

function requireTenantId(tenantId: string): void {
  if (typeof tenantId !== 'string' || !tenantId.trim()) throw new TenantContextMissingError();
}

/** Internal caller capability, established by the caller before administration. */
export function requireI18nSystemContext(moduleRef: ModuleRef, tenantId: string): void {
  requireTenantId(tenantId);
  if (currentI18nHttpContext()) {
    throw new ForbiddenException('I18n internal administration is unavailable to HTTP requests');
  }
  moduleRef.get(SystemContext, { strict: false }).current();
  const context = moduleRef.get(RequestContext, { strict: false });
  if (context.hasActiveContext() && context.tenantId !== undefined) {
    requireI18nTenantContext(moduleRef, tenantId);
  }
}

export function hasI18nTenantAdmission(moduleRef: ModuleRef): boolean {
  const context = moduleRef.get(RequestContext, { strict: false });
  if (!context.hasActiveContext() || !context.tenantId?.trim() || !context.actorId?.trim()) {
    return false;
  }
  const http = currentI18nHttpContext();
  if (!http) return true;
  const proof = http.tenantPort?.get(http.request);
  return (
    proof !== undefined &&
    (proof.mode === 'protected' || proof.mode === 'verified') &&
    proof.tenantId === context.tenantId &&
    proof.actorId === context.actorId
  );
}

/** RequestContext is supplied by the canonical authentication/actor pipeline. */
export function requireI18nTenantContext(moduleRef: ModuleRef, tenantId: string): void {
  requireTenantId(tenantId);
  const context = moduleRef.get(RequestContext, { strict: false });
  if (!context.hasActiveContext() || !context.tenantId?.trim()) {
    throw new TenantContextMissingError();
  }
  if (!context.actorId?.trim()) throw new ActorContextMissingError();
  if (context.tenantId !== tenantId) {
    throw new ForbiddenException('I18n tenant differs from the admitted request context');
  }
  if (!hasI18nTenantAdmission(moduleRef)) {
    throw new ForbiddenException('I18n requires verified tenant admission');
  }
}

/** A tenant frame always wins over an internal capability, including cache hits. */
export function requireI18nCacheContext(
  moduleRef: ModuleRef,
  tenantId: string,
): 'tenant' | 'system' {
  if (currentI18nHttpContext()) {
    requireI18nTenantContext(moduleRef, tenantId);
    return 'tenant';
  }
  const context = moduleRef.get(RequestContext, { strict: false });
  if (context.hasActiveContext() && context.tenantId !== undefined) {
    requireI18nTenantContext(moduleRef, tenantId);
    return 'tenant';
  }
  requireI18nSystemContext(moduleRef, tenantId);
  return 'system';
}
