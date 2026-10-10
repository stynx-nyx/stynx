import type { ModuleRef } from '@nestjs/core';
import { RequestContext, SystemContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';

/** Explicit caller capability for bounded legacy administration unit fixtures. */
export function systemModuleRef(database?: unknown): ModuleRef {
  const providers = new Map<unknown, unknown>([
    [Database, database],
    [RequestContext, { hasActiveContext: () => false }],
    [SystemContext, { current: () => ({ reason: 'explicit unit administration' }) }],
  ]);
  return { get: (token: unknown) => providers.get(token) } as unknown as ModuleRef;
}
