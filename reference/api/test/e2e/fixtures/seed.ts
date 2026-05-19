import type { PostgresTestDatabase } from '../../../../../packages/data/test/support/postgres';

export const tenants = {
  tenantA: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
  tenantB: '01978f4a-32bf-7c27-a131-fd73a9e101a2',
} as const;

export const actors = {
  adminA: {
    userId: '01978f4a-32bf-7c27-a131-fd73a9e102a1',
    membershipId: '01978f4a-32bf-7c27-a131-fd73a9e103a1',
    tenantId: tenants.tenantA,
    email: 'e2e-admin-a@example.com',
  },
  viewerA: {
    userId: '01978f4a-32bf-7c27-a131-fd73a9e102a2',
    membershipId: '01978f4a-32bf-7c27-a131-fd73a9e103a2',
    tenantId: tenants.tenantA,
    email: 'e2e-viewer-a@example.com',
  },
  adminB: {
    userId: '01978f4a-32bf-7c27-a131-fd73a9e102a3',
    membershipId: '01978f4a-32bf-7c27-a131-fd73a9e103a3',
    tenantId: tenants.tenantB,
    email: 'e2e-admin-b@example.com',
  },
} as const;

export type ActorName = keyof typeof actors;

const allRecordsAndNotesPermissions = [
  'sample:record:read',
  'sample:record:write',
  'sample:record:delete',
  'sample:record:restore',
  'sample:record:hard-delete',
  'sample:record-note:read',
  'sample:record-note:write',
  'sample:record-note:delete',
  'sample:record-note:restore',
  'sample:record-note:hard-delete',
] as const;

const adminPermissions = allRecordsAndNotesPermissions.filter((permission) => !permission.endsWith(':hard-delete'));
const viewerPermissions = [
  'sample:record:read',
  'sample:record-note:read',
] as const;

function now(): string {
  return new Date().toISOString();
}

async function grantPermissions(
  client: Awaited<ReturnType<PostgresTestDatabase['connectAsAdmin']>>,
  membershipId: string,
  permissions: readonly string[],
): Promise<void> {
  for (const permission of permissions) {
    await client.query(
      `
        insert into auth.direct_perms (id, membership_id, perm_id, effect)
        select gen_random_uuid(), $1::uuid, perm.id, 'allow'
        from auth.perms perm
        where perm.key = $2
      `,
      [membershipId, permission],
    );
  }
}

export async function seedRecordsAndNotesE2e(database: PostgresTestDatabase): Promise<void> {
  const client = await database.connectAsAdmin();
  const stamp = now();
  try {
    await client.query(
      `
        insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
        values
          ($1::uuid, 'e2e-tenant-a', 'E2E Tenant A', 'active', true, $3::timestamptz, $3::timestamptz),
          ($2::uuid, 'e2e-tenant-b', 'E2E Tenant B', 'active', true, $3::timestamptz, $3::timestamptz)
      `,
      [tenants.tenantA, tenants.tenantB, stamp],
    );

    await client.query(
      `
        insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
        values
          ($1::uuid, $4, $1::text, 'en', $7::timestamptz, $7::timestamptz),
          ($2::uuid, $5, $2::text, 'en', $7::timestamptz, $7::timestamptz),
          ($3::uuid, $6, $3::text, 'en', $7::timestamptz, $7::timestamptz)
      `,
      [
        actors.adminA.userId,
        actors.viewerA.userId,
        actors.adminB.userId,
        actors.adminA.email,
        actors.viewerA.email,
        actors.adminB.email,
        stamp,
      ],
    );

    await client.query(
      `
        insert into auth.memberships (id, tenant_id, user_id, effective_hash, effective_hash_generation, is_active, created_at)
        values
          ($1::uuid, $4::uuid, $6::uuid, null, 0, true, $9::timestamptz),
          ($2::uuid, $4::uuid, $7::uuid, null, 0, true, $9::timestamptz),
          ($3::uuid, $5::uuid, $8::uuid, null, 0, true, $9::timestamptz)
      `,
      [
        actors.adminA.membershipId,
        actors.viewerA.membershipId,
        actors.adminB.membershipId,
        tenants.tenantA,
        tenants.tenantB,
        actors.adminA.userId,
        actors.viewerA.userId,
        actors.adminB.userId,
        stamp,
      ],
    );

    for (const permission of allRecordsAndNotesPermissions) {
      await client.query(
        `
          insert into auth.perms (id, key, description)
          values (gen_random_uuid(), $1, $1)
          on conflict (key) do nothing
        `,
        [permission],
      );
    }

    await grantPermissions(client, actors.adminA.membershipId, adminPermissions);
    await grantPermissions(client, actors.adminB.membershipId, adminPermissions);
    await grantPermissions(client, actors.viewerA.membershipId, viewerPermissions);
  } finally {
    await client.end();
  }
}
