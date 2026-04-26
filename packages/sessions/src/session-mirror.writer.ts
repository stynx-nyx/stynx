import { generateRequestId, RequestContextMutator } from '@stynx/core';
import { Database, sessions as authSessions } from '@stynx/data';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import type { SessionMirror, SessionMirrorEntry } from './types';

@Injectable()
export class SessionMirrorWriter implements SessionMirror {
  constructor(private readonly moduleRef: ModuleRef) {}

  async append(entry: SessionMirrorEntry): Promise<void> {
    const database = this.moduleRef.get(Database, { strict: false });
    const requestContextMutator = this.moduleRef.get(RequestContextMutator, { strict: false });
    if (!database || !requestContextMutator) {
      return;
    }

    await Promise.resolve(
      requestContextMutator.runWithRequestContext(
        {
          requestId: generateRequestId(),
          tenantId: entry.tenantId,
          actorId: entry.userId,
          sessionId: entry.sid,
          startedAt: new Date(entry.createdAt),
        },
        async () => {
          await database.tx(async (trx) => {
            await trx.insert(authSessions).values({
              id: randomUUID(),
              tenantId: entry.tenantId,
              userId: entry.userId,
              sid: entry.sid,
              status: entry.status,
              createdAt: new Date(entry.createdAt),
              expiresAt: new Date(entry.expiresAt),
              ...(entry.membershipId !== undefined ? { membershipId: entry.membershipId } : {}),
            });
          });
        },
      ),
    );
  }
}
