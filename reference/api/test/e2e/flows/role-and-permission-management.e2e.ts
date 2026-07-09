import { PermissionCache } from '@stynx-nyx/auth';
import { auditExpect, expectRLSIsolated } from '@stynx-nyx/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import { actors, tenants } from '../fixtures/seed';

const platformPermissionKeys = [
  'platform:perms:inspect:*',
  'platform:perms:invalidate:*',
] as const;

interface PermissionInspection {
  sid: string;
  permissions: string[];
}

interface RecordBody {
  id: string;
  tenantId?: string;
  tenant_id?: string;
}

interface RoleRow {
  id: string;
  tenant_id: string;
  key: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, encodedPayload] = token.split('.');
  if (!encodedPayload) {
    throw new Error('JWT is missing a payload segment');
  }

  return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Record<
    string,
    unknown
  >;
}

function tokenSid(token: string): string {
  const sid = decodeJwtPayload(token).sid;
  if (typeof sid !== 'string' || sid.length === 0) {
    throw new Error('JWT payload is missing sid');
  }
  return sid;
}

async function grantDirectPermissions(
  context: ReferenceApiE2eContext,
  membershipId: string,
  permissions: readonly string[],
): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    for (const permission of permissions) {
      await client.query(
        `
          insert into auth.perms (id, key, description)
          values (gen_random_uuid(), $1, $1)
          on conflict (key) do nothing
        `,
        [permission],
      );
      await client.query(
        `
          insert into auth.direct_perms (id, membership_id, perm_id, effect)
          select gen_random_uuid(), $1::uuid, perm.id, 'allow'
          from auth.perms perm
          where perm.key = $2
            and not exists (
              select 1
              from auth.direct_perms existing
              where existing.membership_id = $1::uuid
                and existing.perm_id = perm.id
                and existing.effect = 'allow'
            )
        `,
        [membershipId, permission],
      );
    }
  } finally {
    await client.end();
  }
}

async function mutateRbacAsAdmin<T>(
  context: ReferenceApiE2eContext,
  tenantId: string,
  fn: (query: <TRow = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ) => Promise<{ rows: TRow[] }>) => Promise<T>,
): Promise<T> {
  return Promise.resolve(
    context.requestContextMutator.runWithRequestContext(
      {
        requestId: `role-permission-e2e-${Date.now()}`,
        tenantId,
        actorId: actors.adminA.userId,
        startedAt: new Date(),
      },
      () =>
        context.database.tx(
          async (trx) => fn((sql, values) => trx.query(sql, values)),
          { role: 'app', readonly: false },
        ),
    ),
  );
}

async function createTenantRole(
  context: ReferenceApiE2eContext,
  tenantId: string,
  key: string,
  name: string,
): Promise<string> {
  return mutateRbacAsAdmin(context, tenantId, async (query) => {
    const result = await query<{ id: string }>(
      `
        insert into auth.roles (id, tenant_id, key, name, created_at)
        values (gen_random_uuid(), $1::uuid, $2, $3, clock_timestamp())
        returning id::text as id
      `,
      [tenantId, key, name],
    );
    return result.rows[0]?.id ?? '';
  });
}

async function attachRolePermission(
  context: ReferenceApiE2eContext,
  roleId: string,
  permission: string,
): Promise<void> {
  await mutateRbacAsAdmin(context, tenants.tenantA, async (query) => {
    await query(
      `
        insert into auth.role_perms (role_id, perm_id)
        select $1::uuid, perm.id
        from auth.perms perm
        where perm.key = $2
        on conflict do nothing
      `,
      [roleId, permission],
    );
  });
}

async function assignRoleToMembership(
  context: ReferenceApiE2eContext,
  membershipId: string,
  roleId: string,
): Promise<void> {
  await mutateRbacAsAdmin(context, tenants.tenantA, async (query) => {
    await query(
      `
        insert into auth.membership_roles (membership_id, role_id)
        values ($1::uuid, $2::uuid)
        on conflict do nothing
      `,
      [membershipId, roleId],
    );
  });
}

async function revokeRoleFromMembership(
  context: ReferenceApiE2eContext,
  membershipId: string,
  roleId: string,
): Promise<void> {
  await mutateRbacAsAdmin(context, tenants.tenantA, async (query) => {
    await query(
      `
        delete from auth.membership_roles
        where membership_id = $1::uuid
          and role_id = $2::uuid
      `,
      [membershipId, roleId],
    );
  });
}

async function queryTenantRoleRows(
  context: ReferenceApiE2eContext,
  tenantId: string,
): Promise<RoleRow[]> {
  return queryRowsAsTenant<RoleRow>(
    context,
    tenantId,
    actors.adminA.userId,
    `
      select id::text, tenant_id::text, key
      from auth.roles
      where key like 'e2e-role-%'
      order by key asc
    `,
  );
}

describe('@stynx-nyx/reference-api e2e role and permission management', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let viewerASid = '';
  let managedRoleId = '';
  let tenantBRoleId = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e({ databaseName: 'reference_api_role_permissions' });
    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    viewerASid = tokenSid(context.tokens.viewerA);

    await grantDirectPermissions(context, actors.adminA.membershipId, platformPermissionKeys);
    await context.app.get(PermissionCache).invalidateSid(tokenSid(context.tokens.adminA));
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('creates a tenant role, attaches a permission, assigns it, revokes it, and audits RBAC changes', async () => {
    await viewerA.post('/records').send({
      title: 'Role writer denied before assignment',
      email: 'role-denied-before@example.com',
    }).expect(403);

    managedRoleId = await createTenantRole(
      context,
      tenants.tenantA,
      'e2e-role-record-writer',
      'E2E Record Writer',
    );
    expect(managedRoleId).toMatch(/^[0-9a-f-]{36}$/u);
    await auditExpect(context.database, 'roles', 'INSERT', {
      schema: 'auth',
      rowId: managedRoleId,
    });

    await attachRolePermission(context, managedRoleId, 'sample:record:write');
    await auditExpect(context.database, 'role_perms', 'INSERT', { schema: 'auth' });

    await assignRoleToMembership(context, actors.viewerA.membershipId, managedRoleId);
    await auditExpect(context.database, 'membership_roles', 'INSERT', { schema: 'auth' });

    await adminA.post(`/_platform/perms/${viewerASid}/invalidate`).send({}).expect(201);
    const record = (await viewerA.post('/records').send({
      title: 'Role writer created record',
      email: 'role-writer-created@example.com',
      status: 'active',
    }).expect(201)).body as RecordBody;
    expect(record.id).toMatch(/^[0-9a-f-]{36}$/u);
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: record.id,
    });
    await adminA.get(`/_platform/perms/${viewerASid}`).expect(200).expect(
      ({ body }: { body: PermissionInspection }) => {
        expect(body.sid).toBe(viewerASid);
        expect(body.permissions).toEqual(expect.arrayContaining(['sample:record:write']));
      },
    );

    await revokeRoleFromMembership(context, actors.viewerA.membershipId, managedRoleId);
    await auditExpect(context.database, 'membership_roles', 'DELETE', { schema: 'auth' });

    await adminA.post(`/_platform/perms/${viewerASid}/invalidate`).send({}).expect(201);
    await viewerA.post('/records').send({
      title: 'Role writer denied after revoke',
      email: 'role-denied-after@example.com',
    }).expect(403);

    await adminA.get(`/_platform/perms/${viewerASid}`).expect(200).expect(
      ({ body }: { body: PermissionInspection }) => {
        expect(body.permissions).not.toContain('sample:record:write');
      },
    );
  });

  it('keeps tenant-scoped role rows isolated by RLS', async () => {
    tenantBRoleId = await createTenantRole(
      context,
      tenants.tenantB,
      'e2e-role-tenant-b-only',
      'E2E Tenant B Only',
    );
    await auditExpect(context.database, 'roles', 'INSERT', {
      schema: 'auth',
      rowId: tenantBRoleId,
    });

    await expectRLSIsolated(
      (tenantId) => queryTenantRoleRows(context, tenantId),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );

    const tenantARoles = await queryTenantRoleRows(context, tenants.tenantA);
    expect(tenantARoles.map((role) => role.id)).toContain(managedRoleId);
    expect(tenantARoles.map((role) => role.id)).not.toContain(tenantBRoleId);
  });
});
