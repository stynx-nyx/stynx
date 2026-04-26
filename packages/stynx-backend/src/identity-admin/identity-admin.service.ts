import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  IdentityAdminAdapter,
  IdentityLocalSyncAdapter,
  IdentityListUsersQuery,
  IdentitySyncContext,
  IdentityUpdateUserRequest,
  IdentityVerifyChannelsRequest,
} from '@stech/stynx-contracts';
import { IdentityAdminError } from '@stech/stynx-contracts';
import { STYNX_IDENTITY_ADMIN_ADAPTER, STYNX_IDENTITY_LOCAL_SYNC_ADAPTER } from './constants';

function mapIdentityAdminError(error: IdentityAdminError): Error {
  switch (error.code) {
    case 'IDENTITY_NOT_FOUND':
      return new NotFoundException(error.message);
    case 'IDENTITY_FORBIDDEN':
      return new ForbiddenException(error.message);
    case 'IDENTITY_CONFLICT':
      return new ConflictException(error.message);
    case 'IDENTITY_VALIDATION_ERROR':
      return new BadRequestException(error.message);
    case 'IDENTITY_RATE_LIMITED':
    case 'IDENTITY_PROVIDER_ERROR':
    default:
      return new ServiceUnavailableException(error.message);
  }
}

@Injectable()
export class IdentityAdminService {
  constructor(
    @Inject(STYNX_IDENTITY_ADMIN_ADAPTER)
    private readonly adapter: IdentityAdminAdapter,
    @Optional() @Inject(STYNX_IDENTITY_LOCAL_SYNC_ADAPTER)
    private readonly localSyncAdapter?: IdentityLocalSyncAdapter,
  ) {}

  async listUsers(query: IdentityListUsersQuery) {
    return this.wrap(() => this.adapter.listUsers(query));
  }

  async getUser(username: string) {
    return this.wrap(() => this.adapter.getUser(username));
  }

  async getUserBySubject(subject: string) {
    return this.wrap(() => {
      if (!this.adapter.getUserBySubject) {
        throw new IdentityAdminError(
          'IDENTITY_PROVIDER_ERROR',
          'Identity provider adapter does not support getUserBySubject',
          { subject },
        );
      }
      return this.adapter.getUserBySubject(subject);
    });
  }

  async updateUser(username: string, request: IdentityUpdateUserRequest) {
    return this.wrap(() => this.adapter.updateUser(username, request));
  }

  async disableUser(username: string): Promise<{ ok: true }> {
    return this.wrap(async () => {
      await this.adapter.disableUser(username);
      return { ok: true };
    });
  }

  async enableUser(username: string): Promise<{ ok: true }> {
    return this.wrap(async () => {
      await this.adapter.enableUser(username);
      return { ok: true };
    });
  }

  async listGroupsForUser(username: string) {
    return this.wrap(() => this.adapter.listGroupsForUser(username));
  }

  async listGroups(query?: { limit?: number; token?: string }) {
    return this.wrap(() => this.adapter.listGroups(query));
  }

  async addUserToGroup(username: string, groupName: string): Promise<{ ok: true }> {
    return this.wrap(async () => {
      await this.adapter.addUserToGroup(username, groupName);
      return { ok: true };
    });
  }

  async removeUserFromGroup(username: string, groupName: string): Promise<{ ok: true }> {
    return this.wrap(async () => {
      await this.adapter.removeUserFromGroup(username, groupName);
      return { ok: true };
    });
  }

  async resetUserPassword(username: string): Promise<{ ok: true }> {
    return this.wrap(async () => {
      await this.adapter.resetUserPassword(username);
      return { ok: true };
    });
  }

  async setUserPassword(username: string, password: string, permanent = true): Promise<{ ok: true }> {
    return this.wrap(async () => {
      if (!this.adapter.setUserPassword) {
        throw new IdentityAdminError(
          'IDENTITY_PROVIDER_ERROR',
          'Identity provider adapter does not support setUserPassword',
          { username },
        );
      }
      await this.adapter.setUserPassword(username, password, permanent);
      return { ok: true };
    });
  }

  async verifyUserChannels(
    username: string,
    request: IdentityVerifyChannelsRequest,
  ): Promise<{ ok: true }> {
    return this.wrap(async () => {
      if (!this.adapter.verifyUserChannels) {
        throw new IdentityAdminError(
          'IDENTITY_PROVIDER_ERROR',
          'Identity provider adapter does not support verifyUserChannels',
          { username },
        );
      }
      await this.adapter.verifyUserChannels(username, request);
      return { ok: true };
    });
  }

  async syncToLocal(context?: IdentitySyncContext) {
    return this.wrap(() => this.requireLocalSyncAdapter().syncToLocal(context));
  }

  async syncUser(username: string, context?: IdentitySyncContext) {
    return this.wrap(() => this.requireLocalSyncAdapter().syncUser(username, context));
  }

  async listGroupsWithMetaByUserId(userId: string) {
    return this.wrap(() => this.requireLocalSyncAdapter().listGroupsWithMetaByUserId(userId));
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof IdentityAdminError) {
        throw mapIdentityAdminError(error);
      }
      throw error;
    }
  }

  private requireLocalSyncAdapter(): IdentityLocalSyncAdapter {
    if (!this.localSyncAdapter) {
      throw new IdentityAdminError(
        'IDENTITY_PROVIDER_ERROR',
        'Identity local sync adapter is not configured',
      );
    }
    return this.localSyncAdapter;
  }
}
