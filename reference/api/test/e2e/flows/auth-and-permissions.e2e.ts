import { PermissionCache } from '@stynx-nyx/auth';
import { auditExpect, expectRLSIsolated } from '@stynx-nyx/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import { actors, tenants } from '../fixtures/seed';

interface SessionBundleBody {
  sid: string;
  accessToken: string;
  refreshToken: string;
  tenantId?: string;
  email?: string;
  permissions?: string[];
}

interface PermissionInspection {
  sid: string;
  userId: string;
  tenantId: string;
  permissions: string[];
}

interface RecordBody {
  id: string;
  title: string;
  tenantId?: string;
  tenant_id?: string;
}

interface SessionMirrorRow {
  id: string;
  sid: string;
  tenant_id: string;
  status: 'active' | 'revoked' | 'reuse_detected';
}

const platformPermissionKeys = [
  'platform:perms:inspect:*',
  'platform:perms:invalidate:*',
] as const;

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

async function grantPermissions(
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

async function revokePermissions(
  context: ReferenceApiE2eContext,
  membershipId: string,
  permissions: readonly string[],
): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    await client.query(
      `
        delete from auth.direct_perms direct_perm
        using auth.perms perm
        where direct_perm.perm_id = perm.id
          and direct_perm.membership_id = $1::uuid
          and perm.key = any($2::text[])
      `,
      [membershipId, permissions],
    );
  } finally {
    await client.end();
  }
}

async function querySessionMirrorRows(
  context: ReferenceApiE2eContext,
  sid: string,
): Promise<SessionMirrorRow[]> {
  return context.database.withSystemContext('auth e2e session mirror read', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<SessionMirrorRow>(
          `
            select id::text, sid, tenant_id::text, status
            from auth.sessions
            where sid = $1
            order by created_at asc, id asc
          `,
          [sid],
        );
        return result.rows;
      },
      { role: 'owner', readonly: true },
    ),
  );
}

async function countSessionAuditRows(context: ReferenceApiE2eContext, sid: string): Promise<number> {
  return context.database.withSystemContext('auth e2e session audit read', async () =>
    context.database.tx(
      async (trx) => {
        const result = await trx.query<{ value: string | number }>(
          `
            select count(*)::int as value
            from audit.log
            where table_schema = 'auth'
              and operation = 'INSERT'
              and payload #>> '{new,sid}' = $1
          `,
          [sid],
        );
        return Number(result.rows[0]?.value ?? 0);
      },
      { role: 'owner', readonly: true },
    ),
  );
}

async function expectSessionAuditRows(context: ReferenceApiE2eContext, sid: string): Promise<void> {
  const mirrored = await querySessionMirrorRows(context, sid);
  expect(mirrored.length).toBeGreaterThan(0);
  await expect(countSessionAuditRows(context, sid)).resolves.toBe(mirrored.length);
}

describe('@stynx-nyx/reference-api e2e auth and permissions', () => {
  let context: ReferenceApiE2eContext;
  let adminA: AuthenticatedAgent;
  let viewerA: AuthenticatedAgent;
  let adminB: AuthenticatedAgent;
  let adminASid = '';
  let viewerASid = '';

  beforeAll(async () => {
    context = await setupReferenceApiE2e({
      cognitoClaims: {
        sub: actors.adminA.userId,
        email: actors.adminA.email,
      },
    });

    adminASid = tokenSid(context.tokens.adminA);
    viewerASid = tokenSid(context.tokens.viewerA);
    await grantPermissions(context, actors.adminA.membershipId, platformPermissionKeys);
    await context.app.get(PermissionCache).invalidateSid(adminASid);

    adminA = createAuthenticatedAgent(context.app, context.tokens.adminA);
    viewerA = createAuthenticatedAgent(context.app, context.tokens.viewerA);
    adminB = createAuthenticatedAgent(context.app, context.tokens.adminB);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  it('logs in through the reference auth route, verifies the token, publishes JWKS, and audits the session', async () => {
    const login = (await request(context.app.getHttpServer())
      .post('/_reference/dev-login')
      .send({
        email: 'auth-flow-admin@example.com',
        tenantSlug: 'sample-demo',
      })
      .expect(201)).body as SessionBundleBody;

    expect(login).toEqual(
      expect.objectContaining({
        sid: expect.any(String),
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        tenantId: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
        email: 'auth-flow-admin@example.com',
      }),
    );
    expect(login.permissions).toEqual(expect.arrayContaining(['sample:record:read']));

    await request(context.app.getHttpServer())
      .get('/_reference/auth-verify')
      .set('authorization', `Bearer ${login.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toEqual({ status: 'ok' });
      });

    const header = decodeJwtPayload(login.accessToken);
    await request(context.app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200)
      .expect(({ body }) => {
        expect(body.keys).toEqual([
          expect.objectContaining({
            alg: 'RS256',
            kid: expect.any(String),
            kty: 'RSA',
            use: 'sig',
          }),
        ]);
        expect(JSON.stringify(body)).not.toContain('privateKeyPem');
        expect(JSON.stringify(body)).not.toContain('"d"');
      });
    expect(header.sid).toBe(login.sid);

    await expectSessionAuditRows(context, login.sid);
  });

  it('denies missing permissions, grants write permission, invalidates the cache, and revokes it again', async () => {
    await viewerA
      .post('/records')
      .send({
        title: 'Viewer denied before grant',
        email: 'viewer-denied-before-grant@example.com',
      })
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Missing permission sample:record:write');
      });

    await grantPermissions(context, actors.viewerA.membershipId, ['sample:record:write']);
    await adminA.post(`/_platform/perms/${viewerASid}/invalidate`).send({}).expect(201);

    const record = (await viewerA
      .post('/records')
      .send({
        title: 'Viewer granted record',
        email: 'viewer-granted-record@example.com',
        status: 'pending',
      })
      .expect(201)).body as RecordBody;
    expect(record.title).toBe('Viewer granted record');
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: record.id,
    });
    await adminA
      .get(`/_platform/perms/${viewerASid}`)
      .expect(200)
      .expect(({ body }: { body: PermissionInspection }) => {
        expect(body).toEqual(
          expect.objectContaining({
            sid: viewerASid,
            userId: actors.viewerA.userId,
            tenantId: tenants.tenantA,
          }),
        );
        expect(body.permissions).toEqual(expect.arrayContaining(['sample:record:write']));
      });

    await revokePermissions(context, actors.viewerA.membershipId, ['sample:record:write']);
    await adminA.post(`/_platform/perms/${viewerASid}/invalidate`).send({}).expect(201);

    await viewerA
      .patch(`/records/${record.id}`)
      .send({ title: 'Viewer denied after revoke' })
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Missing permission sample:record:write');
      });

    await adminA
      .get(`/_platform/perms/${viewerASid}`)
      .expect(200)
      .expect(({ body }: { body: PermissionInspection }) => {
        expect(body.permissions).not.toContain('sample:record:write');
      });
  });

  it('keeps permission introspection and record access scoped by tenant', async () => {
    const tenantBRecord = (await adminB
      .post('/records')
      .send({
        title: 'Auth flow tenant B',
        email: 'auth-flow-tenant-b@example.com',
        status: 'active',
      })
      .expect(201)).body as RecordBody;
    await auditExpect(context.database, 'record', 'sample.record.create', {
      schema: 'sample',
      rowId: tenantBRecord.id,
    });

    await adminA.get(`/records/${tenantBRecord.id}`).expect(404);
    await adminA.get('/records').expect(200).expect(({ body }: { body: RecordBody[] }) => {
      expect(body.some((row) => row.id === tenantBRecord.id)).toBe(false);
    });

    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<RecordBody>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, tenant_id::text from sample.record',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );
    await expectRLSIsolated(
      (tenantId) =>
        queryRowsAsTenant<SessionMirrorRow>(
          context,
          tenantId,
          actors.adminA.userId,
          'select id::text, sid, tenant_id::text, status from auth.sessions',
        ),
      { tenantA: tenants.tenantA, tenantB: tenants.tenantB },
    );

    await adminA
      .get(`/_platform/perms/${adminASid}`)
      .expect(200)
      .expect(({ body }: { body: PermissionInspection }) => {
        expect(body.tenantId).toBe(tenants.tenantA);
        expect(body.permissions).toEqual(expect.arrayContaining([...platformPermissionKeys]));
      });
  });
});
