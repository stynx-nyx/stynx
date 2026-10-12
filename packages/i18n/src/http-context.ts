import { AsyncLocalStorage } from 'node:async_hooks';
import type { ModuleRef } from '@nestjs/core';
import {
  STYNX_RESOLVED_TENANT_COMMAND_CONTEXT,
  type ResolvedTenantCommandContextPort,
} from '@stynx-nyx/contracts';

interface I18nHttpContext {
  request: object;
  tenantPort: ResolvedTenantCommandContextPort | undefined;
}

const context = new AsyncLocalStorage<I18nHttpContext>();

export function i18nTenantProofPort(
  moduleRef: ModuleRef | undefined,
): ResolvedTenantCommandContextPort | undefined {
  if (!moduleRef) return undefined;
  try {
    return moduleRef.get<ResolvedTenantCommandContextPort>(STYNX_RESOLVED_TENANT_COMMAND_CONTEXT, {
      strict: false,
    });
  } catch {
    // An unavailable provider grants no admission. Errors from port.get are not swallowed.
    return undefined;
  }
}

/** Records HTTP origin; authentication authority remains in the tenancy proof port. */
export function runWithI18nHttpContext<T>(
  request: object,
  tenantPort: ResolvedTenantCommandContextPort | undefined,
  callback: () => T,
): T {
  return context.run({ request, tenantPort }, callback);
}

export function currentI18nHttpContext(): I18nHttpContext | undefined {
  return context.getStore();
}
