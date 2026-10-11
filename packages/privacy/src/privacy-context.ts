import { AsyncLocalStorage } from 'node:async_hooks';
import { ForbiddenException, Injectable, type NestMiddleware } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  STYNX_RESOLVED_TENANT_COMMAND_CONTEXT,
  type ResolvedTenantCommandContextPort,
} from '@stynx-nyx/contracts';
import { RequestContext, SystemContext } from '@stynx-nyx/core';
import { Database, IndependentTransactionConnectionError } from '@stynx-nyx/data';

const origin = new AsyncLocalStorage<object>();

/** Origin survives derived CLS/SystemContext frames; this grants no authority. */
@Injectable()
export class PrivacyHttpContextMiddleware implements NestMiddleware {
  use(request: object, _response: object, next: () => void): void {
    origin.run(request, next);
  }
}

export function requirePrivacySystemContext(moduleRef: ModuleRef): void {
  if (origin.getStore()) {
    throw new ForbiddenException('Global privacy administration is unavailable to HTTP requests');
  }
  moduleRef.get(SystemContext, { strict: false }).current();
  if (moduleRef.get(Database, { strict: false }).hasHeldConnection()) {
    throw new IndependentTransactionConnectionError();
  }
}

export function requirePrivacyTenantContext(moduleRef: ModuleRef): {
  tenantId: string;
  actorId: string;
} {
  const request = origin.getStore();
  const context = moduleRef.get(RequestContext, { strict: false });
  if (!request || !context.hasActiveContext() || !context.tenantId || !context.actorId) {
    throw new ForbiddenException('Privacy requires verified tenant admission');
  }
  let port: ResolvedTenantCommandContextPort | undefined;
  try {
    port = moduleRef.get<ResolvedTenantCommandContextPort>(STYNX_RESOLVED_TENANT_COMMAND_CONTEXT, {
      strict: false,
    });
  } catch {
    throw new ForbiddenException('Privacy requires verified tenant admission');
  }
  const proof = port?.get(request);
  if (
    !proof ||
    !['protected', 'verified'].includes(proof.mode) ||
    proof.tenantId !== context.tenantId ||
    proof.actorId !== context.actorId
  ) {
    throw new ForbiddenException('Privacy requires verified tenant admission');
  }
  if (moduleRef.get(Database, { strict: false }).hasHeldConnection()) {
    throw new IndependentTransactionConnectionError();
  }
  return { tenantId: context.tenantId, actorId: context.actorId };
}
