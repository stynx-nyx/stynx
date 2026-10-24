import { membershipPermissionGrants, permissionUniverse, membershipRoleKeys, activeMembership, membershipHash } from './permission.repository.js';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx-nyx/data';
import { generateRequestId, RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { computePermissionsHash, expandPermissionWildcards } from './utils.js';

export interface ResolvedPermissionState {
  membershipId: string;
  permissions: string[];
  hash: string;
  generation: string | number;
}

@Injectable()
export class PermissionQueryService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async resolveForUser(userId: string, tenantId: string): Promise<ResolvedPermissionState> {
    return this.runWithActorContext(userId, tenantId, async () => {
      const database = this.requireDatabase();
      return database.tx(async (trx) => {
        const membership = await trx.run(activeMembership, [userId, tenantId]);
        const current = membership[0];
        if (!current) {
          throw new ForbiddenException('TENANT_ACCESS_DENIED');
        }

        const grants = await trx.run(membershipPermissionGrants, [current.membership_id]);
        const universe = await trx.run(permissionUniverse, []);
        const permissions = expandPermissionWildcards(
          grants.map((row) => row.key),
          universe.map((row) => row.key),
        );
        const hash = computePermissionsHash(permissions);

        return {
          membershipId: current.membership_id,
          permissions,
          hash,
          generation: current.effective_hash_generation ?? 0,
        };
      });
    });
  }

  /**
   * Role keys held by the user's active membership in the tenant, directly or
   * through groups. Called when a session token is minted, never per request.
   */
  async resolveRolesForUser(userId: string, tenantId: string): Promise<string[]> {
    return this.runWithActorContext(userId, tenantId, async () => {
      const database = this.requireDatabase();
      return database.tx(async (trx) => {
        const result = await trx.run(membershipRoleKeys, [userId, tenantId]);
        return [...new Set(result.map((row) => row.key))].sort();
      });
    });
  }

  async probeHash(
    userId: string,
    tenantId: string,
  ): Promise<{ hash: string | null; generation: string | number }> {
    return this.runWithActorContext(userId, tenantId, async () => {
      const database = this.requireDatabase();
      return database.tx(async (trx) => {
        const result = await trx.run(membershipHash, [userId, tenantId]);
        const row = result[0];
        return {
          hash: row?.effective_hash ?? null,
          generation: row?.effective_hash_generation ?? 0,
        };
      });
    });
  }

  private async runWithActorContext<T>(
    actorId: string,
    tenantId: string,
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

  private requireDatabase() {
    const database = this.moduleRef.get<Database | undefined>(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to PermissionQueryService');
    }
    return database;
  }
}
