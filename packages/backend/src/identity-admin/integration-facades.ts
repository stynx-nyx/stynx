import { Injectable } from '@nestjs/common';
import type {
  IdentityGroupMeta,
  IdentityGroupSummary,
  IdentityLocalSyncResult,
  IdentitySyncContext,
} from '@stynx/contracts';
import { IdentityAdminService } from './identity-admin.service';

export interface PormIdentityListUsersQuery {
  email?: string;
  phone?: string;
  group?: string;
  limit?: number;
  token?: string;
}

export interface PormIdentityListedUser {
  username: string;
  enabled: boolean;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  attributes: Record<string, string>;
  groups?: string[];
}

export interface PormIdentityListUsersResult {
  users: PormIdentityListedUser[];
  nextToken?: string;
}

export interface PormIdentityUpdateUserRequest {
  email?: string;
  phone_number?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  custom?: Record<string, string>;
}

export interface PormIdentityVerifyRequest {
  email?: boolean;
  phone?: boolean;
}

export interface PormIdentityListGroupsResult {
  groups: Array<{ name: string; description?: string }>;
}

export interface PormIdentityListAllGroupsResult extends PormIdentityListGroupsResult {
  nextToken?: string;
}

export interface PecIdentityListUsersQuery {
  email?: string;
  phone?: string;
  group?: string;
  limit?: number;
  token?: string;
}

export interface PecIdentityUserSummary {
  username: string | undefined;
  status: string | undefined;
  enabled: boolean;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
  email: string | null;
  phone_number: string | null;
}

export interface PecIdentityUserDetail {
  username: string | undefined;
  status: string | undefined;
  enabled: boolean;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
  attributes: Record<string, string>;
}

export interface PecIdentityUpdateUserRequest {
  email?: string;
  phone_number?: string;
  custom?: Record<string, string>;
}

export interface PecIdentityVerifyRequest {
  email?: boolean;
  phone?: boolean;
}

export interface PecIdentityListUsersResult {
  items: PecIdentityUserSummary[];
  nextToken?: string;
}

export interface PecIdentityListAllGroupsResult {
  items: IdentityGroupSummary[];
  nextToken?: string;
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function buildIdentityListUsersQuery(query: {
  email?: string;
  phone?: string;
  group?: string;
  limit?: number;
  token?: string;
}) {
  return {
    ...(query.email !== undefined ? { email: query.email } : {}),
    ...(query.phone !== undefined ? { phone: query.phone } : {}),
    ...(query.group !== undefined ? { group: query.group } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
    ...(query.token !== undefined ? { token: query.token } : {}),
  };
}

@Injectable()
export class PormIdentityAdminFacade {
  constructor(private readonly identityAdmin: IdentityAdminService) {}

  async list(query: PormIdentityListUsersQuery): Promise<PormIdentityListUsersResult> {
    const listed = await this.identityAdmin.listUsers(buildIdentityListUsersQuery(query));

    const users = await Promise.all(
      listed.items.map(async (item) => {
        const username = item.username;
        if (!username) {
          return {
            username: '',
            enabled: item.enabled,
            attributes: {},
            groups: [],
            ...(item.status !== undefined ? { status: item.status } : {}),
            ...(item.createdAt !== undefined ? { createdAt: item.createdAt } : {}),
            ...(item.updatedAt !== undefined ? { updatedAt: item.updatedAt } : {}),
          };
        }
        return this.get(username);
      }),
    );

    return {
      users,
      ...(listed.nextToken !== undefined ? { nextToken: listed.nextToken } : {}),
    };
  }

  async get(username: string): Promise<PormIdentityListedUser> {
    const [user, groups] = await Promise.all([
      this.identityAdmin.getUser(username),
      this.identityAdmin.listGroupsForUser(username),
    ]);

    return {
      username: user.username,
      enabled: user.enabled,
      attributes: user.attributes,
      groups: groups.map((group) => group.name),
      ...(user.status !== undefined ? { status: user.status } : {}),
      ...(user.createdAt !== undefined ? { createdAt: user.createdAt } : {}),
      ...(user.updatedAt !== undefined ? { updatedAt: user.updatedAt } : {}),
    };
  }

  async getBySub(sub: string): Promise<PormIdentityListedUser> {
    const user = await this.identityAdmin.getUserBySubject(sub);
    return this.get(user.username);
  }

  async update(
    username: string,
    request: PormIdentityUpdateUserRequest,
  ): Promise<{ updated: boolean }> {
    if (!this.hasUpdatableAttributes(request)) {
      return { updated: false };
    }

    await this.identityAdmin.updateUser(username, {
      ...(request.email !== undefined ? { email: request.email } : {}),
      ...(request.phone_number !== undefined ? { phoneNumber: request.phone_number } : {}),
      ...(request.name !== undefined ? { name: request.name } : {}),
      ...(request.given_name !== undefined ? { givenName: request.given_name } : {}),
      ...(request.family_name !== undefined ? { familyName: request.family_name } : {}),
      ...(request.custom !== undefined ? { custom: request.custom } : {}),
    });

    return { updated: true };
  }

  async disable(username: string): Promise<{ disabled: true }> {
    await this.identityAdmin.disableUser(username);
    return { disabled: true };
  }

  async enable(username: string): Promise<{ enabled: true }> {
    await this.identityAdmin.enableUser(username);
    return { enabled: true };
  }

  async listGroups(username: string): Promise<PormIdentityListGroupsResult> {
    const groups = await this.identityAdmin.listGroupsForUser(username);
    return { groups };
  }

  async listGroupsWithMetaByUserId(userId: string): Promise<{ groups: IdentityGroupMeta[] }> {
    return this.identityAdmin.listGroupsWithMetaByUserId(userId);
  }

  async listAllGroups(query: { limit?: number; token?: string } = {}): Promise<PormIdentityListAllGroupsResult> {
    const result = await this.identityAdmin.listGroups(query);
    return {
      groups: result.items,
      ...(result.nextToken !== undefined ? { nextToken: result.nextToken } : {}),
    };
  }

  async addToGroup(username: string, groupName: string): Promise<{ added: true }> {
    await this.identityAdmin.addUserToGroup(username, groupName);
    return { added: true };
  }

  async removeFromGroup(username: string, groupName: string): Promise<{ removed: true }> {
    await this.identityAdmin.removeUserFromGroup(username, groupName);
    return { removed: true };
  }

  async verify(username: string, request: PormIdentityVerifyRequest): Promise<{ verified: boolean }> {
    if (!request.email && !request.phone) {
      return { verified: false };
    }
    await this.identityAdmin.verifyUserChannels(username, request);
    return { verified: true };
  }

  async resetPassword(username: string): Promise<{ reset: true }> {
    await this.identityAdmin.resetUserPassword(username);
    return { reset: true };
  }

  async setPassword(
    username: string,
    newPassword: string,
    permanent = true,
  ): Promise<{ updated: true }> {
    await this.identityAdmin.setUserPassword(username, newPassword, permanent);
    return { updated: true };
  }

  async syncToLocal(context?: IdentitySyncContext): Promise<IdentityLocalSyncResult> {
    return this.identityAdmin.syncToLocal(context);
  }

  async syncUser(
    username: string,
    context?: IdentitySyncContext,
  ): Promise<IdentityLocalSyncResult & { id?: string }> {
    return this.identityAdmin.syncUser(username, context);
  }

  private hasUpdatableAttributes(request: PormIdentityUpdateUserRequest): boolean {
    if (
      request.email !== undefined ||
      request.phone_number !== undefined ||
      request.name !== undefined ||
      request.given_name !== undefined ||
      request.family_name !== undefined
    ) {
      return true;
    }
    return Object.keys(request.custom ?? {}).length > 0;
  }
}

@Injectable()
export class PecIdentityAdminFacade {
  constructor(private readonly identityAdmin: IdentityAdminService) {}

  async list(query: PecIdentityListUsersQuery): Promise<PecIdentityListUsersResult> {
    const listed = await this.identityAdmin.listUsers(buildIdentityListUsersQuery(query));

    return {
      items: listed.items.map((item) => ({
        username: item.username,
        status: item.status,
        enabled: item.enabled,
        createdAt: toDate(item.createdAt),
        updatedAt: toDate(item.updatedAt),
        email: item.email ?? null,
        phone_number: item.phoneNumber ?? null,
      })),
      ...(listed.nextToken !== undefined ? { nextToken: listed.nextToken } : {}),
    };
  }

  async get(username: string): Promise<PecIdentityUserDetail> {
    const user = await this.identityAdmin.getUser(username);
    return {
      username: user.username,
      status: user.status,
      enabled: user.enabled,
      createdAt: toDate(user.createdAt),
      updatedAt: toDate(user.updatedAt),
      attributes: user.attributes,
    };
  }

  async update(
    username: string,
    request: PecIdentityUpdateUserRequest,
  ): Promise<PecIdentityUserDetail> {
    const user = await this.identityAdmin.updateUser(username, {
      ...(request.email !== undefined ? { email: request.email } : {}),
      ...(request.phone_number !== undefined ? { phoneNumber: request.phone_number } : {}),
      ...(request.custom !== undefined ? { custom: request.custom } : {}),
    });
    return {
      username: user.username,
      status: user.status,
      enabled: user.enabled,
      createdAt: toDate(user.createdAt),
      updatedAt: toDate(user.updatedAt),
      attributes: user.attributes,
    };
  }

  async disable(username: string): Promise<{ ok: true }> {
    return this.identityAdmin.disableUser(username);
  }

  async enable(username: string): Promise<{ ok: true }> {
    return this.identityAdmin.enableUser(username);
  }

  async listGroups(username: string): Promise<IdentityGroupSummary[]> {
    return this.identityAdmin.listGroupsForUser(username);
  }

  async addToGroup(username: string, groupName: string): Promise<{ ok: true }> {
    return this.identityAdmin.addUserToGroup(username, groupName);
  }

  async removeFromGroup(username: string, groupName: string): Promise<{ ok: true }> {
    return this.identityAdmin.removeUserFromGroup(username, groupName);
  }

  async listAllGroups(
    query: { limit?: number; token?: string } = {},
  ): Promise<PecIdentityListAllGroupsResult> {
    const result = await this.identityAdmin.listGroups(query);
    return {
      items: result.items,
      ...(result.nextToken !== undefined ? { nextToken: result.nextToken } : {}),
    };
  }

  async verify(username: string, request: PecIdentityVerifyRequest): Promise<{ ok: true }> {
    return this.identityAdmin.verifyUserChannels(username, request);
  }

  async resetPassword(username: string): Promise<{ ok: true }> {
    return this.identityAdmin.resetUserPassword(username);
  }
}
