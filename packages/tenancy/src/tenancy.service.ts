import { listTenants, tenantById, tenantBySlug, updateTenant, upsertTenantSettings, lockTenantSlug, insertTenant, upsertOwner, userByEmail, upsertMembership, ownerRoleByTenant, assignOwnerRole, activateTenant, suspendTenant, activeSessionCount, archiveTenant, purgeTenant, upsertRole, pendingInvitation, insertInvitation, type TenantRow } from './tenancy.repository.js';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, executeTypedQuery, type Transaction } from '@stynx-nyx/data';
import { MembershipAccessCache } from './membership-cache.js';
import {
  STYNX_TENANT_MEMBERSHIP_CACHE,
  STYNX_TENANT_ARCHIVE_EXPORTER,
  STYNX_TENANT_INVITE_SENDER,
  STYNX_TENANT_PREFIX_PROVISIONER,
  STYNX_TENANT_PURGE_DELEGATE,
  type TenantArchiveExporter,
  type TenantInviteSender,
  type TenantPrefixProvisioner,
  type TenantPurgeDelegate,
} from './tokens.js';
import type {
  ArchiveTenantResult,
  ProvisionTenantInput,
  ProvisionTenantResult,
  PurgeTenantResult,
  SuspendTenantInput,
  SuspendTenantResult,
  TenantDetail,
  TenantSummary,
  UpdateTenantInput,
} from './types.js';
import { createUuidV7 } from './utils.js';



type QueryExecutor = Pick<Transaction, 'query'>;

function mapTenant(row: TenantRow): TenantDetail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    state: row.state ?? 'active',
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    timezone: row.timezone,
    locale: row.locale,
    settings: row.settings ?? {},
    suspendedReason: row.suspended_reason,
    archivedAt: row.archived_at,
  };
}

function toSummary(detail: TenantDetail): TenantSummary {
  return {
    id: detail.id,
    slug: detail.slug,
    name: detail.name,
    state: detail.state,
    isActive: detail.isActive,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
  };
}

class NoopTenantPrefixProvisioner implements TenantPrefixProvisioner {
  async ensurePrefix(): Promise<void> {}
}

class NoopTenantInviteSender implements TenantInviteSender {
  async sendOwnerInvite(): Promise<void> {}
}

class PlaceholderTenantArchiveExporter implements TenantArchiveExporter {
  async exportPlaceholder(tenantId: string): Promise<string> {
    return `tenants/${tenantId}/exports/placeholder.json`;
  }
}

class NoopTenantPurgeDelegate implements TenantPurgeDelegate {
  async purgeTenant(): Promise<void> {}
}

@Injectable()
export class TenancyService {
  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_TENANT_MEMBERSHIP_CACHE)
    private readonly membershipCache: MembershipAccessCache,
    @Inject(STYNX_TENANT_PREFIX_PROVISIONER)
    prefixProvisioner?: TenantPrefixProvisioner,
    @Inject(STYNX_TENANT_INVITE_SENDER)
    inviteSender?: TenantInviteSender,
    @Inject(STYNX_TENANT_ARCHIVE_EXPORTER)
    archiveExporter?: TenantArchiveExporter,
    @Inject(STYNX_TENANT_PURGE_DELEGATE)
    purgeDelegate?: TenantPurgeDelegate,
  ) {
    this.prefixProvisioner = prefixProvisioner ?? new NoopTenantPrefixProvisioner();
    this.inviteSender = inviteSender ?? new NoopTenantInviteSender();
    this.archiveExporter = archiveExporter ?? new PlaceholderTenantArchiveExporter();
    this.purgeDelegate = purgeDelegate ?? new NoopTenantPurgeDelegate();
  }

  private readonly prefixProvisioner: TenantPrefixProvisioner;
  private readonly inviteSender: TenantInviteSender;
  private readonly archiveExporter: TenantArchiveExporter;
  private readonly purgeDelegate: TenantPurgeDelegate;

  async listTenants(): Promise<TenantSummary[]> {
    const database = this.requireDatabase();
    return database.withSystemContext('tenant admin list tenants', async () =>
      database.tx(async (trx) => {
        const result = await executeTypedQuery(trx, listTenants, []);
        return result.map((row) => toSummary(mapTenant(row)));
      }, { role: 'owner', readonly: true }),
    );
  }

  async getTenant(id: string): Promise<TenantDetail> {
    const database = this.requireDatabase();
    return database.withSystemContext(`tenant admin get ${id}`, async () =>
      database.tx(async (trx) => {
        const result = await executeTypedQuery(trx, tenantById, [id]);
        const row = result;
        if (!row) {
          throw new NotFoundException('TENANT_NOT_FOUND');
        }
        return mapTenant(row);
      }, { role: 'owner', readonly: true }),
    );
  }

  async updateTenant(id: string, input: UpdateTenantInput): Promise<TenantDetail> {
    const database = this.requireDatabase();
    return database.withSystemContext(`tenant admin patch ${id}`, async () =>
      database.tx(async (trx) => {
        const current = await this.lookupTenant(trx, id);
        if (!current) {
          throw new NotFoundException('TENANT_NOT_FOUND');
        }

        await executeTypedQuery(trx, updateTenant,
          [id, input.slug ?? current.slug, input.name ?? current.name],
        );

        if (input.timezone !== undefined || input.locale !== undefined || input.settings !== undefined) {
          const nextSettings = input.settings ?? current.settings;
          await executeTypedQuery(trx, upsertTenantSettings,
            [
              id,
              input.timezone ?? current.timezone ?? null,
              input.locale ?? current.locale ?? null,
              JSON.stringify(nextSettings),
            ],
          );
        }

        return this.requireTenant(await this.lookupTenant(trx, id));
      }, { role: 'owner' }),
    );
  }

  async provisionTenant(input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
    const database = this.requireDatabase();
    return database.withSystemContext(`tenant provision ${input.slug}`, async () =>
      database.tx(async (trx) => {
        await executeTypedQuery(trx, lockTenantSlug, [input.slug]);

        const existing = await this.lookupTenantBySlug(trx, input.slug);
        if (existing) {
          const invitation = await this.ensureInvitation(trx, existing.id, input.ownerEmail);
          return {
            tenant: mapTenant(existing),
            invitationToken: invitation.token,
            ownerUserId: invitation.userId,
          };
        }

        const tenantId = createUuidV7();
        const ownerUserId = input.ownerUserId ?? createUuidV7();
        const invitationToken = createUuidV7();

        await executeTypedQuery(trx, insertTenant,
          [tenantId, input.slug, input.name],
        );

        await executeTypedQuery(trx, upsertOwner,
          [ownerUserId, input.ownerEmail, input.ownerLocale ?? null],
        );

        const userLookup = await executeTypedQuery(trx, userByEmail,
          [input.ownerEmail],
        );
        const effectiveOwnerUserId = userLookup?.id ?? ownerUserId;

        await this.ensureDefaultRoles(trx, tenantId);

        const membership = await executeTypedQuery(trx, upsertMembership,
          [createUuidV7(), tenantId, effectiveOwnerUserId],
        );
        const membershipId = membership?.id;
        const ownerRole = await executeTypedQuery(trx, ownerRoleByTenant,
          [tenantId],
        );

        if (membershipId && ownerRole?.id) {
          await executeTypedQuery(trx, assignOwnerRole,
            [membershipId, ownerRole.id],
          );
        }

        await this.ensureInvitationRecord(trx, tenantId, effectiveOwnerUserId, input.ownerEmail, invitationToken);
        await this.prefixProvisioner.ensurePrefix(tenantId);
        await this.inviteSender.sendOwnerInvite({
          tenantId,
          tenantSlug: input.slug,
          tenantName: input.name,
          email: input.ownerEmail,
          invitationToken,
        });

        await executeTypedQuery(trx, activateTenant,
          [tenantId],
        );

        const tenant = await this.requireTenant(await this.lookupTenant(trx, tenantId));
        return {
          tenant,
          invitationToken,
          ownerUserId: effectiveOwnerUserId,
        };
      }, { role: 'owner' }),
    );
  }

  async suspendTenant(id: string, input: SuspendTenantInput): Promise<SuspendTenantResult> {
    const database = this.requireDatabase();
    return database.withSystemContext(`tenant suspend ${id}`, async () =>
      database.tx(async (trx) => {
        const current = await this.lookupTenant(trx, id);
        if (!current) {
          throw new NotFoundException('TENANT_NOT_FOUND');
        }

        await executeTypedQuery(trx, suspendTenant,
          [id, input.reason.trim()],
        );

        const activeSessions = await executeTypedQuery(trx, activeSessionCount,
          [id],
        );

        return {
          tenant: this.requireTenant(await this.lookupTenant(trx, id)),
          activeSessionCount: Number(activeSessions?.count ?? '0'),
        };
      }, { role: 'owner' }),
    ).then((result) => {
      this.membershipCache.invalidateTenant(id);
      return result;
    });
  }

  async archiveTenant(id: string): Promise<ArchiveTenantResult> {
    const database = this.requireDatabase();
    return database.withSystemContext(`tenant archive ${id}`, async () =>
      database.tx(async (trx) => {
        const current = await this.lookupTenant(trx, id);
        if (!current) {
          throw new NotFoundException('TENANT_NOT_FOUND');
        }

        const exportKey = await this.archiveExporter.exportPlaceholder(id);
        await executeTypedQuery(trx, archiveTenant,
          [id],
        );

        return {
          tenant: this.requireTenant(await this.lookupTenant(trx, id)),
          exportKey,
        };
      }, { role: 'owner' }),
    ).then((result) => {
      this.membershipCache.invalidateTenant(id);
      return result;
    });
  }

  async purgeTenant(id: string): Promise<PurgeTenantResult> {
    const database = this.requireDatabase();
    return database.withSystemContext(`tenant purge ${id}`, async () =>
      database.tx(async (trx) => {
        const current = await this.lookupTenant(trx, id);
        if (!current) {
          throw new NotFoundException('TENANT_NOT_FOUND');
        }

        await this.purgeDelegate.purgeTenant(id);
        await executeTypedQuery(trx, purgeTenant,
          [id],
        );

        return {
          tenant: this.requireTenant(await this.lookupTenant(trx, id)),
        };
      }, { role: 'owner' }),
    ).then((result) => {
      this.membershipCache.invalidateTenant(id);
      return result;
    });
  }

  private async ensureDefaultRoles(trx: QueryExecutor, tenantId: string): Promise<void> {
    for (const role of [
      { key: 'owner', name: 'Owner' },
      { key: 'admin', name: 'Admin' },
      { key: 'member', name: 'Member' },
      { key: 'viewer', name: 'Viewer' },
    ]) {
      await executeTypedQuery(trx, upsertRole,
        [createUuidV7(), tenantId, role.key, role.name],
      );
    }
  }

  private async ensureInvitation(
    trx: QueryExecutor,
    tenantId: string,
    ownerEmail: string,
  ): Promise<{ token: string; userId: string }> {
    const current = await executeTypedQuery(trx, pendingInvitation,
      [tenantId, ownerEmail],
    );
    if (current?.token && current?.user_id) {
      return {
        token: current.token,
        userId: current.user_id,
      };
    }

    const user = await executeTypedQuery(trx, userByEmail,
      [ownerEmail],
    );
    const userId = user?.id ?? createUuidV7();
    const token = createUuidV7();
    await this.ensureInvitationRecord(trx, tenantId, userId, ownerEmail, token);
    return { token, userId };
  }

  private async ensureInvitationRecord(
    trx: QueryExecutor,
    tenantId: string,
    userId: string,
    ownerEmail: string,
    token: string,
  ): Promise<void> {
    await executeTypedQuery(trx, insertInvitation,
      [createUuidV7(), tenantId, ownerEmail, userId, token],
    );
  }


  private async lookupTenant(
    trx: QueryExecutor,
    id: string,
  ): Promise<TenantDetail | undefined> {
    const result = await executeTypedQuery(trx, tenantById, [id]);
    const row = result;
    return row ? mapTenant(row) : undefined;
  }

  private async lookupTenantBySlug(
    trx: QueryExecutor,
    slug: string,
  ): Promise<TenantRow | undefined> {
    const result = await executeTypedQuery(trx, tenantBySlug, [slug]);
    return result ?? undefined;
  }

  private requireTenant(tenant: TenantDetail | undefined): TenantDetail {
    if (!tenant) {
      throw new NotFoundException('TENANT_NOT_FOUND');
    }
    return tenant;
  }

  private requireDatabase(): Database {
    const database = this.moduleRef.get(Database, { strict: false });
    if (!database) {
      throw new Error('Database provider is unavailable to TenancyService');
    }
    return database;
  }
}
