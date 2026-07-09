import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { computePermissionsHash, expandPermissionWildcards } from './utils';

interface IdRow {
  id: string;
}

interface PermissionKeyRow {
  key: string;
}

@Injectable()
export class EffectiveHashComputer {
  constructor(private readonly moduleRef: ModuleRef) {}

  async afterMembershipRoleMutation(trx: Transaction, membershipIds: string[]): Promise<void> {
    await this.recomputeMembershipIds(trx, membershipIds);
  }

  async afterDirectPermissionMutation(trx: Transaction, membershipIds: string[]): Promise<void> {
    await this.recomputeMembershipIds(trx, membershipIds);
  }

  async afterGroupMembershipMutation(trx: Transaction, membershipIds: string[]): Promise<void> {
    await this.recomputeMembershipIds(trx, membershipIds);
  }

  async afterRolePermissionMutation(trx: Transaction, roleIds: string[]): Promise<void> {
    if (roleIds.length === 0) {
      return;
    }
    const directMemberships = await trx.query<IdRow>(
      `
        select distinct membership_id as id
        from auth.membership_roles
        where role_id = any($1::uuid[])
      `,
      [roleIds],
    );
    const groupMemberships = await trx.query<IdRow>(
      `
        select distinct gm.membership_id as id
        from auth.group_roles gr
        join auth.group_memberships gm on gm.group_id = gr.group_id
        where gr.role_id = any($1::uuid[])
      `,
      [roleIds],
    );
    await this.recomputeMembershipIds(trx, [
      ...directMemberships.rows.map((row) => row.id),
      ...groupMemberships.rows.map((row) => row.id),
    ]);
  }

  async afterGroupRoleMutation(trx: Transaction, groupIds: string[]): Promise<void> {
    if (groupIds.length === 0) {
      return;
    }
    const memberships = await trx.query<IdRow>(
      `
        select distinct membership_id as id
        from auth.group_memberships
        where group_id = any($1::uuid[])
      `,
      [groupIds],
    );
    await this.recomputeMembershipIds(trx, memberships.rows.map((row) => row.id));
  }

  async afterPlatformRoleChange(trx: Transaction): Promise<void> {
    const memberships = await trx.query<IdRow>(
      `
        select distinct membership.id
        from auth.memberships membership
        join auth.membership_roles membership_role on membership_role.membership_id = membership.id
        join auth.roles role on role.id = membership_role.role_id
        where role.tenant_id is null
      `,
      [],
    );
    await this.recomputeMembershipIds(trx, memberships.rows.map((row) => row.id));
  }

  async ensureMembershipHash(userId: string, tenantId: string): Promise<void> {
    const database = this.requireDatabase();
    await database.tx(async (trx) => {
      const result = await trx.query<IdRow>(
        `
          select id
          from auth.memberships
          where user_id = $1
            and tenant_id = $2
            and is_active = true
          limit 1
        `,
        [userId, tenantId],
      );
      await this.recomputeMembershipIds(trx, result.rows.map((row) => row.id));
    });
  }

  private async recomputeMembershipIds(trx: Transaction, membershipIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(membershipIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }

    const universe = await trx.query<PermissionKeyRow>('select key from auth.perms');
    for (const membershipId of uniqueIds) {
      const grants = await trx.query<PermissionKeyRow>(
        `
          select distinct perm.key
          from auth.direct_perms direct_perm
          join auth.perms perm on perm.id = direct_perm.perm_id
          where direct_perm.membership_id = $1::uuid
            and direct_perm.effect = 'allow'
          union
          select distinct perm.key
          from auth.membership_roles membership_role
          join auth.role_perms role_perm on role_perm.role_id = membership_role.role_id
          join auth.perms perm on perm.id = role_perm.perm_id
          where membership_role.membership_id = $1::uuid
          union
          select distinct perm.key
          from auth.group_memberships group_membership
          join auth.group_roles group_role on group_role.group_id = group_membership.group_id
          join auth.role_perms role_perm on role_perm.role_id = group_role.role_id
          join auth.perms perm on perm.id = role_perm.perm_id
          where group_membership.membership_id = $1::uuid
        `,
        [membershipId],
      );

      const expanded = expandPermissionWildcards(
        grants.rows.map((row) => row.key),
        universe.rows.map((row) => row.key),
      );
      const hash = computePermissionsHash(expanded);

      await trx.query(
        `
          update auth.memberships
          set effective_hash = $2,
              effective_hash_generation = effective_hash_generation + 1
          where id = $1::uuid
        `,
        [membershipId, hash],
      );
    }
  }

  private requireDatabase() {
    const database = this.moduleRef.get(Database, { strict: false }) as {
      tx<T>(fn: (trx: Transaction) => Promise<T>): Promise<T>;
    } | undefined;
    if (!database) {
      throw new Error('Database provider is unavailable to EffectiveHashComputer');
    }
    return database;
  }
}
