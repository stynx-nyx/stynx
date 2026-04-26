import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database, type Transaction } from '@stynx/data';
import { v7 as uuidv7 } from 'uuid';
import { MembershipAccessCache } from './membership-cache';
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
} from './tokens';
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
} from './types';

interface TenantRow {
  id: string;
  slug: string;
  name: string;
  state: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  timezone: string | null;
  locale: string | null;
  settings: Record<string, unknown> | null;
  suspended_reason: string | null;
  archived_at: string | null;
}

type QueryExecutor = Pick<Transaction, 'query'>;

function mapTenant(row: TenantRow): TenantDetail {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    state: (row.state ?? 'active') as TenantDetail['state'],
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
        const result = await trx.query<TenantRow>(this.baseTenantSelectSql(`
          order by tenant.created_at desc
        `));
        return result.rows.map((row) => toSummary(mapTenant(row)));
      }, { role: 'owner', readonly: true }),
    );
  }

  async getTenant(id: string): Promise<TenantDetail> {
    const database = this.requireDatabase();
    return database.withSystemContext(`tenant admin get ${id}`, async () =>
      database.tx(async (trx) => {
        const result = await trx.query<TenantRow>(this.baseTenantSelectSql(`where tenant.id = $1::uuid limit 1`), [id]);
        const row = result.rows[0];
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

        await trx.query(
          `
            update tenancy.tenants
               set slug = $2,
                   name = $3,
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
          [id, input.slug ?? current.slug, input.name ?? current.name],
        );

        if (input.timezone !== undefined || input.locale !== undefined || input.settings !== undefined) {
          const nextSettings = input.settings ?? current.settings ?? {};
          await trx.query(
            `
              insert into tenancy.tenant_settings (tenant_id, timezone, locale, settings, updated_at)
              values ($1::uuid, $2, $3, $4::jsonb, clock_timestamp())
              on conflict (tenant_id)
              do update set
                timezone = excluded.timezone,
                locale = excluded.locale,
                settings = excluded.settings,
                updated_at = clock_timestamp()
            `,
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
        await trx.query(`select pg_advisory_xact_lock(hashtext($1))`, [input.slug]);

        const existing = await this.lookupTenantBySlug(trx, input.slug);
        if (existing) {
          const invitation = await this.ensureInvitation(trx, existing.id, input.ownerEmail);
          return {
            tenant: mapTenant(existing),
            invitationToken: invitation.token,
            ownerUserId: invitation.userId,
          };
        }

        const tenantId = uuidv7();
        const ownerUserId = input.ownerUserId ?? uuidv7();
        const invitationToken = uuidv7();

        await trx.query(
          `
            insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
            values ($1::uuid, $2, $3, 'provisioning', true, clock_timestamp(), clock_timestamp())
          `,
          [tenantId, input.slug, input.name],
        );

        await trx.query(
          `
            insert into auth.users (id, email, locale, created_at, updated_at)
            values ($1::uuid, $2::citext, $3, clock_timestamp(), clock_timestamp())
            on conflict (email)
            do update set
              locale = coalesce(excluded.locale, auth.users.locale),
              updated_at = clock_timestamp()
          `,
          [ownerUserId, input.ownerEmail, input.ownerLocale ?? null],
        );

        const userLookup = await trx.query<{ id: string }>(
          `select id::text as id from auth.users where email = $1::citext limit 1`,
          [input.ownerEmail],
        );
        const effectiveOwnerUserId = userLookup.rows[0]?.id ?? ownerUserId;

        await this.ensureDefaultRoles(trx, tenantId);

        const membership = await trx.query<{ id: string }>(
          `
            insert into auth.memberships (id, tenant_id, user_id, is_active, created_at)
            values ($1::uuid, $2::uuid, $3::uuid, false, clock_timestamp())
            on conflict (tenant_id, user_id)
            do update set user_id = excluded.user_id
            returning id::text as id
          `,
          [uuidv7(), tenantId, effectiveOwnerUserId],
        );
        const membershipId = membership.rows[0]?.id;
        const ownerRole = await trx.query<{ id: string }>(
          `select id::text as id from auth.roles where tenant_id = $1::uuid and key = 'owner' limit 1`,
          [tenantId],
        );

        if (membershipId && ownerRole.rows[0]?.id) {
          await trx.query(
            `
              insert into auth.membership_roles (membership_id, role_id)
              values ($1::uuid, $2::uuid)
              on conflict do nothing
            `,
            [membershipId, ownerRole.rows[0].id],
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

        await trx.query(
          `
            update tenancy.tenants
               set state = 'active',
                   is_active = true,
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
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

        await trx.query(
          `
            update tenancy.tenants
               set is_active = false,
                   state = 'suspended',
                   suspended_reason = $2,
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
          [id, input.reason.trim()],
        );

        const activeSessions = await trx.query<{ count: string }>(
          `
            select count(*)::text as count
            from auth.sessions
            where tenant_id = $1::uuid
              and status = 'active'
              and expires_at > clock_timestamp()
          `,
          [id],
        );

        return {
          tenant: this.requireTenant(await this.lookupTenant(trx, id)),
          activeSessionCount: Number(activeSessions.rows[0]?.count ?? '0'),
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
        await trx.query(
          `
            update tenancy.tenants
               set is_active = false,
                   state = 'archived',
                   archived_at = coalesce(archived_at, clock_timestamp()),
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
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
        await trx.query(
          `
            update tenancy.tenants
               set is_active = false,
                   state = 'purged',
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
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
      await trx.query(
        `
          insert into auth.roles (id, tenant_id, key, name, created_at)
          values ($1::uuid, $2::uuid, $3, $4, clock_timestamp())
          on conflict (tenant_id, key)
          do update set name = excluded.name
        `,
        [uuidv7(), tenantId, role.key, role.name],
      );
    }
  }

  private async ensureInvitation(
    trx: QueryExecutor,
    tenantId: string,
    ownerEmail: string,
  ): Promise<{ token: string; userId: string }> {
    const current = await trx.query<{ token: string; user_id: string }>(
      `
        select invitation.token::text as token, membership.user_id::text as user_id
        from auth.invitations invitation
        join auth.users usr on usr.email = invitation.email
        left join auth.memberships membership
          on membership.tenant_id = invitation.tenant_id
         and membership.user_id = usr.id
        where invitation.tenant_id = $1::uuid
          and invitation.email = $2::citext
          and invitation.status = 'pending'
        order by invitation.created_at desc
        limit 1
      `,
      [tenantId, ownerEmail],
    );
    if (current.rows[0]?.token && current.rows[0]?.user_id) {
      return {
        token: current.rows[0].token,
        userId: current.rows[0].user_id,
      };
    }

    const user = await trx.query<{ id: string }>(
      `select id::text as id from auth.users where email = $1::citext limit 1`,
      [ownerEmail],
    );
    const userId = user.rows[0]?.id ?? uuidv7();
    const token = uuidv7();
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
    await trx.query(
      `
        insert into auth.invitations (id, tenant_id, email, invited_by, token, status, expires_at, created_at)
        values ($1::uuid, $2::uuid, $3::citext, $4::uuid, $5, 'pending', clock_timestamp() + interval '7 days', clock_timestamp())
      `,
      [uuidv7(), tenantId, ownerEmail, userId, token],
    );
  }

  private baseTenantSelectSql(suffix: string): string {
    return `
      select
        tenant.id::text as id,
        tenant.slug,
        tenant.name,
        tenant.state,
        tenant.is_active,
        tenant.created_at::text as created_at,
        tenant.updated_at::text as updated_at,
        settings.timezone,
        settings.locale,
        settings.settings,
        tenant.suspended_reason,
        tenant.archived_at::text as archived_at
      from tenancy.tenants tenant
      left join tenancy.tenant_settings settings
        on settings.tenant_id = tenant.id
      ${suffix}
    `;
  }

  private async lookupTenant(
    trx: QueryExecutor,
    id: string,
  ): Promise<TenantDetail | undefined> {
    const result = await trx.query<TenantRow>(this.baseTenantSelectSql('where tenant.id = $1::uuid limit 1'), [id]);
    const row = result.rows[0];
    return row ? mapTenant(row) : undefined;
  }

  private async lookupTenantBySlug(
    trx: QueryExecutor,
    slug: string,
  ): Promise<TenantRow | undefined> {
    const result = await trx.query<TenantRow>(this.baseTenantSelectSql('where tenant.slug = $1 limit 1'), [slug]);
    return result.rows[0];
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
