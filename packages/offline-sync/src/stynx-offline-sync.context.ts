import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from '@stynx-nyx/core';
import { OfflineSyncError } from './errors';
import type { OfflineSyncContextPort, TrustedOfflineSyncScope } from './types';

@Injectable()
export class StynxOfflineSyncContext implements OfflineSyncContextPort {
  constructor(private readonly moduleRef: ModuleRef) {}

  current(): TrustedOfflineSyncScope {
    let tenantId: string | undefined;
    let actorId: string | undefined;
    try {
      const context = this.moduleRef.get(RequestContext, { strict: false });
      tenantId = context.tenantId;
      actorId = context.actorId;
    } catch {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_UNAUTHENTICATED',
        401,
        'An authenticated request context is required for offline sync.',
      );
    }
    if (!actorId) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_UNAUTHENTICATED',
        401,
        'An authenticated actor is required for offline sync.',
      );
    }
    if (!tenantId) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_FORBIDDEN',
        403,
        'A tenant context is required for offline sync.',
      );
    }
    return { tenantId, actorId };
  }
}
