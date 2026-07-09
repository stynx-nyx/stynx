import { PermissionCache, StynxAuthService } from '@stynx-nyx/auth';
import { SessionService, type SessionBundle } from '@stynx-nyx/sessions';
import { expectRLSIsolated } from '@stynx-nyx/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeReferenceApiE2e,
  queryRowsAsTenant,
  setupReferenceApiE2e,
  type ReferenceApiE2eContext,
} from '../fixtures/app';
import { createAuthenticatedAgent, type AuthenticatedAgent } from '../fixtures/http';
import { actors, tenants, type ActorName } from '../fixtures/seed';

interface PermissionInspection {
  sid: string;
  userId: string;
  tenantId: string;
  permissions: string[];
}

interface SessionMirrorRow {
  id: string;
  sid: string;
  tenant_id: string;
  status: 'active' | 'revoked' | 'reuse_detected';
}

const platformSessionPermissions = [
  'platform:perms:inspect:*',
  'platform:perms:invalidate:*',
] as const;

function decodeJwtHeader(token: string): Record<string, unknown> {
  const [encodedHeader] = token.split('.');
  if (!encodedHeader) {
    throw new Error('JWT is missing a header segment');
  }

  const normalized = encodedHeader.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

async function grantPlatformSessionPermissions(context: ReferenceApiE2eContext): Promise<void> {
  const client = await context.postgres.connectAsAdmin();
  try {
    for (const permission of platformSessionPermissions) {
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
        [actors.adminA.membershipId, permission],
      );
    }
  } finally {
    await client.end();
  }

  const permissionCache = context.app.get(PermissionCache);
  await permissionCache.publishInvalidation(`${actors.adminA.userId}:${tenants.tenantA}`);
}

async function querySessionMirrorRows(context: ReferenceApiE2eContext, sid: string): Promise<SessionMirrorRow[]> {
  return context.database.withSystemContext('sessions e2e mirror read', async () =>
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
  return context.database.withSystemContext('sessions e2e audit read', async () =>
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
  const rows = await querySessionMirrorRows(context, sid);
  expect(rows.length).toBeGreaterThan(0);
  await expect(countSessionAuditRows(context, sid)).resolves.toBe(rows.length);
}

describe('@stynx-nyx/reference-api e2e sessions management', () => {
  let context: ReferenceApiE2eContext;
  let authService: StynxAuthService;
  let sessionService: SessionService;
  let adminA: AuthenticatedAgent;
  let routeAdminSession: SessionBundle;

  beforeAll(async () => {
    context = await setupReferenceApiE2e({
      cognitoClaims: {
        sub: actors.adminA.userId,
        email: actors.adminA.email,
      },
    });
    await grantPlatformSessionPermissions(context);
    authService = context.app.get(StynxAuthService);
    sessionService = context.app.get(SessionService);

    routeAdminSession = (await request(context.app.getHttpServer())
      .post('/sessions')
      .set('x-tenant-id', tenants.tenantA)
      .send({ cognitoToken: 'fake-cognito-access-token', deviceMeta: { ua: 'sessions-e2e' } })
      .expect(201)).body as SessionBundle;
    adminA = createAuthenticatedAgent(context.app, routeAdminSession.accessToken);
  }, 180_000);

  afterAll(async () => {
    await closeReferenceApiE2e(context);
  });

  async function createSessionFor(actorName: ActorName): Promise<SessionBundle> {
    const actor = actors[actorName];
    return authService.exchangeExistingIdentity(actor.userId, actor.userId, actor.tenantId, {
      ua: `sessions-e2e-${actorName}`,
    });
  }

  it('exchanges a Cognito login for an active STYNX session and exposes public JWKS', async () => {
    expect(routeAdminSession).toMatchObject({
      sid: expect.any(String),
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
    });

    await adminA
      .get(`/_platform/perms/${routeAdminSession.sid}`)
      .expect(200)
      .expect(({ body }: { body: PermissionInspection }) => {
        expect(body).toMatchObject({
          sid: routeAdminSession.sid,
          userId: actors.adminA.userId,
          tenantId: tenants.tenantA,
        });
        expect(body.permissions).toEqual(expect.arrayContaining([...platformSessionPermissions]));
      });

    const jwks = await request(context.app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200);
    const tokenHeader = decodeJwtHeader(routeAdminSession.accessToken);
    expect(jwks.body.keys).toEqual([
      expect.objectContaining({
        alg: 'RS256',
        kid: tokenHeader.kid,
        kty: 'RSA',
        use: 'sig',
      }),
    ]);
    expect(JSON.stringify(jwks.body)).not.toContain('privateKeyPem');
    expect(JSON.stringify(jwks.body)).not.toContain('"d"');

    await expect(querySessionMirrorRows(context, routeAdminSession.sid)).resolves.toEqual([
      expect.objectContaining({
        sid: routeAdminSession.sid,
        tenant_id: tenants.tenantA,
        status: 'active',
      }),
    ]);
    await expectSessionAuditRows(context, routeAdminSession.sid);
  });

  it('denies session inspection to an actor without platform session-management permission', async () => {
    const viewerSession = await createSessionFor('viewerA');
    const viewerA = createAuthenticatedAgent(context.app, viewerSession.accessToken);

    await viewerA
      .get(`/_platform/perms/${routeAdminSession.sid}`)
      .expect(403)
      .expect(({ body }) => {
        expect(body.message).toBe('Missing permission platform:perms:inspect:*');
      });
  });

  it('revokes another active session and records the session mirror/audit trail', async () => {
    const viewerSession = await createSessionFor('viewerA');
    const viewerA = createAuthenticatedAgent(context.app, viewerSession.accessToken);

    await viewerA.get('/records').expect(200);
    await expect(sessionService.revoke(viewerSession.sid)).resolves.toBe(true);
    await viewerA.get('/records').expect(401);

    await expect(querySessionMirrorRows(context, viewerSession.sid)).resolves.toEqual([
      expect.objectContaining({
        sid: viewerSession.sid,
        tenant_id: tenants.tenantA,
        status: 'active',
      }),
      expect.objectContaining({
        sid: viewerSession.sid,
        tenant_id: tenants.tenantA,
        status: 'revoked',
      }),
    ]);
    await expectSessionAuditRows(context, viewerSession.sid);
  });

  it('logs out the current route session while leaving a sibling session active', async () => {
    const logoutSession = await createSessionFor('adminA');
    const siblingSession = await createSessionFor('adminA');
    const logoutAgent = createAuthenticatedAgent(context.app, logoutSession.accessToken);
    const siblingAgent = createAuthenticatedAgent(context.app, siblingSession.accessToken);

    await logoutAgent.post('/sessions/logout').expect(201).expect(({ body }) => {
      expect(body).toEqual({ status: 'ok' });
    });

    await logoutAgent.get('/records').expect(401);
    await siblingAgent.get('/records').expect(200);

    await expect(querySessionMirrorRows(context, logoutSession.sid)).resolves.toEqual([
      expect.objectContaining({ status: 'active' }),
      expect.objectContaining({ status: 'revoked' }),
    ]);
    await expect(querySessionMirrorRows(context, siblingSession.sid)).resolves.toEqual([
      expect.objectContaining({ status: 'active' }),
    ]);
    await expectSessionAuditRows(context, logoutSession.sid);
  });

  it('keeps mirrored active sessions isolated by tenant under RLS', async () => {
    const adminBSession = await createSessionFor('adminB');
    await expect(querySessionMirrorRows(context, adminBSession.sid)).resolves.toEqual([
      expect.objectContaining({
        sid: adminBSession.sid,
        tenant_id: tenants.tenantB,
        status: 'active',
      }),
    ]);

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
    await expectSessionAuditRows(context, adminBSession.sid);
  });
});
