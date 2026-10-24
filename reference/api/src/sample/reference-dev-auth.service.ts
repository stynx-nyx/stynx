import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PermissionCache, PermissionQueryService } from '@stynx-nyx/auth';
import { Database, executeTypedQuery } from '@stynx-nyx/data';
import * as queries from './reference-dev-auth.repository.js';
import { SessionService, type SessionBundle } from '@stynx-nyx/sessions';

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

  async login(input: { email?: string; tenantId?: string; tenantSlug?: string }): Promise<SessionBundle & { tenantId: string; email: string; permissions: string[] }> {
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
        await executeTypedQuery(trx, queries.assignMembershipRole, [membershipId, adminRoleId]);

        return { userId, membershipId };
      }, { role: 'owner', readonly: false }),
    );

    const permissions = await this.permissionQueries.resolveForUser(identity.userId, tenant.id);
    const bundle = await this.sessionService.create(
      identity.userId,
      tenant.id,
      email,
      {},
      {
        membershipId: permissions.membershipId,
        permsHash: permissions.hash,
      },
    );
    await this.permissionCache?.prime(
      {
        sid: bundle.sid,
        userId: identity.userId,
        tenantId: tenant.id,
        membershipId: permissions.membershipId,
        permissions: permissions.permissions,
        hash: permissions.hash,
        generation: permissions.generation,
        computedAt: Date.now(),
      },
      bundle.expiresAt,
    );

    return {
      ...bundle,
      tenantId: tenant.id,
      email,
      permissions: permissions.permissions,
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

  private get permissionQueries(): PermissionQueryService {
    return this.requireProvider(PermissionQueryService, 'PermissionQueryService');
  }

  private get permissionCache(): PermissionCache | null {
    try {
      return this.moduleRef.get<PermissionCache>(PermissionCache, { strict: false }) ?? null;
    } catch {
      return null;
    }
  }

  private requireProvider<T>(token: new (...args: never[]) => T, label: string): T {
    const provider = this.moduleRef.get<T>(token, { strict: false });
    if (!provider) {
      throw new Error(`${label} provider is unavailable to ReferenceDevAuthService`);
    }
    return provider;
  }

  private async ensureTenant(trx: QueryLike, tenant: DemoTenant): Promise<void> {
    await executeTypedQuery(trx, queries.ensureTenant, [tenant.id, tenant.slug, tenant.name]);

    await executeTypedQuery(trx, queries.ensureTenantSettings, [tenant.id]);
  }

  private async ensureUser(trx: QueryLike, email: string): Promise<string> {
    const existing = await executeTypedQuery(trx, queries.findUser, [email]);
    const existingId = existing?.id ?? null;
    if (existingId) {
      await executeTypedQuery(trx, queries.updateUser, [existingId, `reference-dev:${email}`]);
      return existingId;
    }

    const inserted = await executeTypedQuery(trx, queries.insertUser, [email, `reference-dev:${email}`]);
    return inserted?.id ?? '';
  }

  private async ensureMembership(trx: QueryLike, tenantId: string, userId: string): Promise<string> {
    const existing = await executeTypedQuery(trx, queries.findMembership, [tenantId, userId]);
    const existingId = existing?.id ?? null;
    if (existingId) {
      await executeTypedQuery(trx, queries.reactivateMembership, [existingId]);
      return existingId;
    }

    const inserted = await executeTypedQuery(trx, queries.insertMembership, [tenantId, userId]);
    return inserted?.id ?? '';
  }

  private async ensureAdminRole(trx: QueryLike, tenantId: string): Promise<string> {
    await executeTypedQuery(trx, queries.ensureAdminRole, [tenantId]);

    const role = await executeTypedQuery(trx, queries.findAdminRole, [tenantId]);
    return role?.id ?? '';
  }

  private async ensureAdminRolePerms(trx: QueryLike, roleId: string): Promise<void> {
    await executeTypedQuery(trx, queries.grantAdminRolePermissions, [roleId]);
  }
}
