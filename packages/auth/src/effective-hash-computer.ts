import { directRoleMemberships, groupRoleMemberships, membershipsForGroups, platformRoleMemberships, activeUserMembership, hashPermissionUniverse, hashMembershipGrants, writeMembershipHash } from './identity.repository.js';
import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { computePermissionsHash, expandPermissionWildcards } from './utils.js';

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
    const directMemberships = await trx.run(directRoleMemberships,
      [roleIds],
    );
    const groupMemberships = await trx.run(groupRoleMemberships,
      [roleIds],
    );
    await this.recomputeMembershipIds(trx, [
      ...directMemberships.map((row) => row.id),
      ...groupMemberships.map((row) => row.id),
    ]);
  }

  async afterGroupRoleMutation(trx: Transaction, groupIds: string[]): Promise<void> {
    if (groupIds.length === 0) {
      return;
    }
    const memberships = await trx.run(membershipsForGroups,
      [groupIds],
    );
    await this.recomputeMembershipIds(trx, memberships.map((row) => row.id));
  }

  async afterPlatformRoleChange(trx: Transaction): Promise<void> {
    const memberships = await trx.run(platformRoleMemberships,
      [],
    );
    await this.recomputeMembershipIds(trx, memberships.map((row) => row.id));
  }

  async ensureMembershipHash(userId: string, tenantId: string): Promise<void> {
    const database = this.requireDatabase();
    await database.tx(async (trx) => {
      const result = await trx.run(activeUserMembership,
        [userId, tenantId],
      );
      await this.recomputeMembershipIds(trx, result.map((row) => row.id));
    });
  }

  private async recomputeMembershipIds(trx: Transaction, membershipIds: string[]): Promise<void> {
    const uniqueIds = [...new Set(membershipIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }

    const universe = await trx.run(hashPermissionUniverse, []);
    for (const membershipId of uniqueIds) {
      const grants = await trx.run(hashMembershipGrants,
        [membershipId],
      );

      const expanded = expandPermissionWildcards(
        grants.map((row) => row.key),
        universe.map((row) => row.key),
      );
      const hash = computePermissionsHash(expanded);

      await trx.run(writeMembershipHash,
        [membershipId, hash],
      );
    }
  }

  private requireDatabase() {
    const database = this.moduleRef.get<Database | undefined>(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to EffectiveHashComputer');
    }
    return database;
  }
}
