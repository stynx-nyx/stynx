import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { generateRequestId, RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { SessionService, type SessionBundle } from '@stynx-nyx/sessions';
import { CognitoJwtValidator } from './cognito-jwt.validator';
import { EffectiveHashComputer } from './effective-hash-computer';
import { PermissionCache } from './permission-cache';
import { PermissionQueryService } from './permission-query.service';
import type { CognitoAccessTokenClaims } from './types';

interface UserRow {
  id: string;
  external_subject: string | null;
  email: string;
}

interface AuthDatabase {
  tx<T>(
    fn: (trx: Transaction) => Promise<T>,
    options?: { role?: 'owner' | 'app' | 'reader'; readonly?: boolean },
  ): Promise<T>;
  withSystemContext<T>(reason: string, fn: () => Promise<T>): Promise<T>;
}

export interface SessionActor {
  sid: string;
  sub: string;
  cognitoSub?: string;
}

@Injectable()
export class StynxAuthService {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly permissionCache: PermissionCache,
    private readonly permissionQueries: PermissionQueryService,
    private readonly effectiveHashComputer: EffectiveHashComputer,
    private readonly cognitoValidator: CognitoJwtValidator,
  ) {}

  async exchangeCognitoToken(
    cognitoToken: string,
    tenantId: string,
    deviceMeta: Record<string, unknown> = {},
  ): Promise<SessionBundle> {
    const claims = await this.cognitoValidator.validateAccessToken(cognitoToken);
    const user = await this.findOrCreateUser(claims, tenantId);
    return this.runWithActorContext(tenantId, user.id, async () => {
      await this.effectiveHashComputer.ensureMembershipHash(user.id, tenantId);
      const permissions = await this.permissionQueries.resolveForUser(user.id, tenantId);
      const session = await this.requireSessionService().create(
        user.id,
        tenantId,
        claims.sub,
        deviceMeta,
        {
          membershipId: permissions.membershipId,
          permsHash: permissions.hash,
        },
      );
      await this.permissionCache.prime(
        {
          sid: session.sid,
          userId: user.id,
          tenantId,
          membershipId: permissions.membershipId,
          permissions: permissions.permissions,
          hash: permissions.hash,
          generation: permissions.generation,
          computedAt: Date.now(),
        },
        session.expiresAt,
      );
      return session;
    });
  }

  async switchTenant(
    actor: SessionActor,
    tenantId: string,
    deviceMeta: Record<string, unknown> = {},
  ): Promise<SessionBundle> {
    const session = await this.exchangeExistingIdentity(
      actor.sub,
      actor.cognitoSub,
      tenantId,
      deviceMeta,
    );
    await this.requireSessionService().revoke(actor.sid);
    await this.permissionCache.invalidateSid(actor.sid);
    return session;
  }

  async logout(sid: string): Promise<void> {
    await this.requireSessionService().revoke(sid);
    await this.permissionCache.invalidateSid(sid);
  }

  async exchangeExistingIdentity(
    userId: string,
    cognitoSub: string | undefined,
    tenantId: string,
    deviceMeta: Record<string, unknown> = {},
  ): Promise<SessionBundle> {
    return this.runWithActorContext(tenantId, userId, async () => {
      await this.effectiveHashComputer.ensureMembershipHash(userId, tenantId);
      const permissions = await this.permissionQueries.resolveForUser(userId, tenantId);
      const session = await this.requireSessionService().create(
        userId,
        tenantId,
        cognitoSub ?? userId,
        deviceMeta,
        {
          membershipId: permissions.membershipId,
          permsHash: permissions.hash,
        },
      );
      await this.permissionCache.prime(
        {
          sid: session.sid,
          userId,
          tenantId,
          membershipId: permissions.membershipId,
          permissions: permissions.permissions,
          hash: permissions.hash,
          generation: permissions.generation,
          computedAt: Date.now(),
        },
        session.expiresAt,
      );
      return session;
    });
  }

  async inspectPermissions(sid: string) {
    return this.permissionCache.inspectSid(sid);
  }

  async invalidatePermissions(sid: string): Promise<void> {
    await this.permissionCache.invalidateSid(sid);
  }

  private async runWithActorContext<T>(
    tenantId: string,
    actorId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const requestContext = this.moduleRef.get(RequestContext, { strict: false });
    const requestContextMutator = this.moduleRef.get(RequestContextMutator, { strict: false });
    if (!requestContextMutator) {
      return fn();
    }
    if (requestContext?.hasActiveContext()) {
      requestContextMutator.patch({ tenantId, actorId });
      return fn();
    }
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

  private async findOrCreateUser(
    claims: CognitoAccessTokenClaims,
    tenantId: string,
  ): Promise<{ id: string; cognitoSub: string }> {
    const database = this.requireDatabase();
    const existing = await database.withSystemContext('auth cognito user lookup', () =>
      database.tx(
        async (trx) =>
          trx.query<UserRow>(
            `
            select id, external_subject, email
            from auth.users
            where external_subject = $1
               or ($2::text is not null and email = $2)
            limit 1
          `,
            [claims.sub, claims.email ?? null],
          ),
        { role: 'owner', readonly: true },
      ),
    );

    const current = existing.rows[0];
    if (current) {
      return this.runWithActorContext(tenantId, current.id, async () => {
        await database.tx(async (trx) => {
          await trx.query(
            `
              update auth.users
              set external_subject = $2,
                  email = $3,
                  updated_at = clock_timestamp()
              where id = $1::uuid
            `,
            [current.id, claims.sub, claims.email ?? current.email],
          );
        });
        return { id: current.id, cognitoSub: claims.sub };
      });
    }

    const userId = randomUUID();
    return this.runWithActorContext(tenantId, userId, async () => {
      await database.tx(async (trx) => {
        await trx.query(
          `
            insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
            values ($1::uuid, $2, $3, 'pt-BR', clock_timestamp(), clock_timestamp())
          `,
          [userId, claims.email ?? `${claims.sub}@stynx.local`, claims.sub],
        );
      });
      return { id: userId, cognitoSub: claims.sub };
    });
  }

  private requireDatabase(): AuthDatabase {
    const database = this.moduleRef.get(Database, { strict: false }) as AuthDatabase | undefined;
    if (!database) {
      throw new Error('Database provider is unavailable to StynxAuthService');
    }
    return database;
  }

  private requireSessionService() {
    const service = this.moduleRef.get(SessionService, { strict: false }) as
      | {
          create: (...args: unknown[]) => Promise<SessionBundle>;
          revoke: (sid: string) => Promise<boolean>;
        }
      | undefined;
    if (!service) {
      throw new Error('SessionService provider is unavailable to StynxAuthService');
    }
    return service;
  }
}
