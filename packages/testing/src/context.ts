import { generateRequestId, type RequestContextMutator } from '@stynx/core';

export interface TenantActorTarget {
  tenantId?: string;
  actorId?: string;
  sessionId?: string;
}

export async function withTenant<T>(
  requestContextMutator: RequestContextMutator,
  tenantId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return Promise.resolve(
    requestContextMutator.runWithRequestContext(
      {
        requestId: generateRequestId(),
        tenantId,
        actorId: '00000000-0000-0000-0000-000000000001',
        startedAt: new Date(),
      },
      fn,
    ),
  );
}

export async function withActor<T>(
  requestContextMutator: RequestContextMutator,
  actorId: string,
  fn: () => Promise<T>,
  tenantId = '00000000-0000-0000-0000-000000000001',
): Promise<T> {
  return Promise.resolve(
    requestContextMutator.runWithRequestContext(
      {
        requestId: generateRequestId(),
        tenantId,
        actorId,
        startedAt: new Date(),
      },
      fn,
    ),
  );
}
