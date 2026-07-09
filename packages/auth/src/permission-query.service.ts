import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { generateRequestId, RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { computePermissionsHash, expandPermissionWildcards } from './utils';

interface MembershipRow {
  membership_id: string;
  effective_hash: string | null;
  effective_hash_generation: number | null;
}

interface PermissionKeyRow {
  key: string;
}

export interface ResolvedPermissionState {
  membershipId: string;
  permissions: string[];
  hash: string;
  generation: number;
}

@Injectable()
export class PermissionQueryService {
  constructor(private readonly moduleRef: ModuleRef) {}

  async resolveForUser(userId: string, tenantId: string): Promise<ResolvedPermissionState> {
    return this.runWithActorContext(userId, tenantId, async () => {
      const database = this.requireDatabase();
      return database.tx(async (trx) => {
        const membership = await trx.query<MembershipRow>(
          `
            select id as membership_id, effective_hash, effective_hash_generation
            from auth.memberships
            where user_id = $1
              and tenant_id = $2
              and is_active = true
            limit 1
          `,
          [userId, tenantId],
        );
        const current = membership.rows[0];
        if (!current) {
          throw new Error('TENANT_ACCESS_DENIED');
        }

        const grants = await trx.query<PermissionKeyRow>(
          `
            with membership as (
              select id
              from auth.memberships
              where id = $1::uuid
            )
            select distinct perm.key
            from auth.direct_perms direct_perm
            join auth.perms perm on perm.id = direct_perm.perm_id
            join membership membership_row on membership_row.id = direct_perm.membership_id
            where direct_perm.effect = 'allow'
            union
            select distinct perm.key
            from auth.membership_roles membership_role
            join auth.role_perms role_perm on role_perm.role_id = membership_role.role_id
            join auth.perms perm on perm.id = role_perm.perm_id
            join membership membership_row on membership_row.id = membership_role.membership_id
            union
            select distinct perm.key
            from auth.group_memberships group_membership
            join auth.group_roles group_role on group_role.group_id = group_membership.group_id
            join auth.role_perms role_perm on role_perm.role_id = group_role.role_id
            join auth.perms perm on perm.id = role_perm.perm_id
            join membership membership_row on membership_row.id = group_membership.membership_id
          `,
          [current.membership_id],
        );
        const universe = await trx.query<PermissionKeyRow>('select key from auth.perms');
        const permissions = expandPermissionWildcards(
          grants.rows.map((row) => row.key),
          universe.rows.map((row) => row.key),
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

  async probeHash(userId: string, tenantId: string): Promise<{ hash: string | null; generation: number }> {
    return this.runWithActorContext(userId, tenantId, async () => {
      const database = this.requireDatabase();
      return database.tx(async (trx) => {
        const result = await trx.query<{ effective_hash: string | null; effective_hash_generation: number | null }>(
          `
            select effective_hash, effective_hash_generation
            from auth.memberships
            where user_id = $1
              and tenant_id = $2
              and is_active = true
            limit 1
          `,
          [userId, tenantId],
        );
        const row = result.rows[0];
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
    const database = this.moduleRef.get(Database, { strict: false }) as {
      tx<T>(fn: (trx: Transaction) => Promise<T>): Promise<T>;
    } | undefined;
    if (!database) {
      throw new Error('Database provider is unavailable to PermissionQueryService');
    }
    return database;
  }
}
