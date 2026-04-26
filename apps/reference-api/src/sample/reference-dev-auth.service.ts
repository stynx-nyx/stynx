import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx/data';
import { SessionService, type SessionBundle } from '@stynx/sessions';

type DemoTenant = {
  id: string;
  slug: string;
  name: string;
};

type QueryLike = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

const DEMO_TENANTS: DemoTenant[] = [
  {
    id: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
    slug: 'sample-demo',
    name: 'Sample Demo Tenant',
  },
  {
    id: '01978f4a-32bf-7c27-a131-fd73a9e001a2',
    slug: 'sample-ops',
    name: 'Sample Ops Tenant',
  },
];

const DEFAULT_DEMO_EMAIL = 'admin@sample-demo.test';

@Injectable()
export class ReferenceDevAuthService {
  constructor(
    private readonly moduleRef: ModuleRef,
  ) {}

  listDemoTenants(): DemoTenant[] {
    return DEMO_TENANTS;
  }

  async login(input: { email?: string; tenantId?: string; tenantSlug?: string }): Promise<SessionBundle & { tenantId: string; email: string }> {
    const tenant = this.resolveTenant(input.tenantId, input.tenantSlug);
    const email = (input.email ?? DEFAULT_DEMO_EMAIL).trim().toLowerCase();

    if (email.length === 0) {
      throw new UnauthorizedException('Email is required');
    }

    const identity = await this.database.withSystemContext(`reference dev login ${tenant.slug}`, async () =>
      this.database.tx(async (trx) => {
        await this.ensureTenant(trx, tenant);
        const userId = await this.ensureUser(trx, email);
        const membershipId = await this.ensureMembership(trx, tenant.id, userId);
        const adminRoleId = await this.ensureAdminRole(trx, tenant.id);
        await this.ensureAdminRolePerms(trx, adminRoleId);
        await trx.query(
          `
            insert into auth.membership_roles (membership_id, role_id)
            values ($1::uuid, $2::uuid)
            on conflict do nothing
          `,
          [membershipId, adminRoleId],
        );

        return { userId, membershipId };
      }, { role: 'owner', readonly: false }),
    );

    const bundle = await this.sessionService.create(identity.userId, tenant.id, email, {}, { membershipId: identity.membershipId });
    return {
      ...bundle,
      tenantId: tenant.id,
      email,
    };
  }

  private resolveTenant(tenantId?: string, tenantSlug?: string): DemoTenant {
    const normalizedTenantId = tenantId?.trim();
    if (normalizedTenantId) {
      const byId = DEMO_TENANTS.find((tenant) => tenant.id === normalizedTenantId);
      if (byId) {
        return byId;
      }
    }

    const normalizedTenantSlug = tenantSlug?.trim().toLowerCase();
    if (normalizedTenantSlug) {
      const bySlug = DEMO_TENANTS.find((tenant) => tenant.slug === normalizedTenantSlug);
      if (bySlug) {
        return bySlug;
      }
    }

    return DEMO_TENANTS[0] ?? {
      id: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
      slug: 'sample-demo',
      name: 'Sample Demo Tenant',
    };
  }

  private get database(): Database {
    return this.requireProvider(Database, 'Database');
  }

  private get sessionService(): SessionService {
    return this.requireProvider(SessionService, 'SessionService');
  }

  private requireProvider<T>(token: new (...args: never[]) => T, label: string): T {
    const provider = this.moduleRef.get(token, { strict: false });
    if (!provider) {
      throw new Error(`${label} provider is unavailable to ReferenceDevAuthService`);
    }
    return provider;
  }

  private async ensureTenant(trx: QueryLike, tenant: DemoTenant): Promise<void> {
    await trx.query(
      `
        insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
        values ($1::uuid, $2, $3, 'active', true, clock_timestamp(), clock_timestamp())
        on conflict (id)
        do update set
          slug = excluded.slug,
          name = excluded.name,
          state = 'active',
          is_active = true,
          archived_at = null,
          suspended_reason = null,
          updated_at = clock_timestamp()
      `,
      [tenant.id, tenant.slug, tenant.name],
    );

    await trx.query(
      `
        insert into tenancy.tenant_settings (tenant_id, locale, timezone, settings, updated_at)
        values ($1::uuid, 'en-US', 'UTC', '{}'::jsonb, clock_timestamp())
        on conflict (tenant_id)
        do update set updated_at = clock_timestamp()
      `,
      [tenant.id],
    );
  }

  private async ensureUser(trx: QueryLike, email: string): Promise<string> {
    const existing = await trx.query(
      `select id::text as id from auth.users where email = $1::citext limit 1`,
      [email],
    );
    const existingId = typeof existing.rows[0]?.id === 'string' ? existing.rows[0].id : null;
    if (existingId) {
      await trx.query(
        `
          update auth.users
             set external_subject = $2,
                 updated_at = clock_timestamp()
           where id = $1::uuid
        `,
        [existingId, `reference-dev:${email}`],
      );
      return existingId;
    }

    const inserted = await trx.query(
      `
        insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
        values (gen_random_uuid(), $1::citext, $2, 'en-US', clock_timestamp(), clock_timestamp())
        returning id::text as id
      `,
      [email, `reference-dev:${email}`],
    );
    return typeof inserted.rows[0]?.id === 'string' ? inserted.rows[0].id : '';
  }

  private async ensureMembership(trx: QueryLike, tenantId: string, userId: string): Promise<string> {
    const existing = await trx.query(
      `
        select id::text as id
          from auth.memberships
         where tenant_id = $1::uuid
           and user_id = $2::uuid
         limit 1
      `,
      [tenantId, userId],
    );
    const existingId = typeof existing.rows[0]?.id === 'string' ? existing.rows[0].id : null;
    if (existingId) {
      await trx.query(
        `
          update auth.memberships
             set is_active = true
           where id = $1::uuid
        `,
        [existingId],
      );
      return existingId;
    }

    const inserted = await trx.query(
      `
        insert into auth.memberships (id, tenant_id, user_id, effective_hash, effective_hash_generation, is_active, created_at)
        values (gen_random_uuid(), $1::uuid, $2::uuid, null, 0, true, clock_timestamp())
        returning id::text as id
      `,
      [tenantId, userId],
    );
    return typeof inserted.rows[0]?.id === 'string' ? inserted.rows[0].id : '';
  }

  private async ensureAdminRole(trx: QueryLike, tenantId: string): Promise<string> {
    await trx.query(
      `
        insert into auth.roles (id, tenant_id, key, name, created_at)
        values (gen_random_uuid(), $1::uuid, 'admin', 'Admin', clock_timestamp())
        on conflict (tenant_id, key)
        do update set name = excluded.name
      `,
      [tenantId],
    );

    const role = await trx.query(
      `
        select id::text as id
          from auth.roles
         where tenant_id = $1::uuid
           and key = 'admin'
         limit 1
      `,
      [tenantId],
    );
    return typeof role.rows[0]?.id === 'string' ? role.rows[0].id : '';
  }

  private async ensureAdminRolePerms(trx: QueryLike, roleId: string): Promise<void> {
    await trx.query(
      `
        insert into auth.role_perms (role_id, perm_id)
        select $1::uuid, perm.id
          from auth.perms perm
         where perm.key like 'sample:%'
           and perm.key not like '%:hard-delete'
        on conflict do nothing
      `,
      [roleId],
    );
  }
}
