import { createHmac } from 'node:crypto';
import { Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Public, StynxAuthGuard, StynxJwtValidator, PermissionCache } from '@stynx-nyx/auth';
import { STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL } from '@stynx-nyx/contracts';
import { RequestContext, StynxCoreModule } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { StynxTenancyModule } from '@stynx-nyx/tenancy';
import request from 'supertest';
import { z } from 'zod';
import { StynxWebhookSignatureModule, WebhookSignatureGuard } from '../../src';

// UPS-HOOK-02: two separate Nest processes must share this atomic reservation.
class SharedReplayStore {
  readonly entries = new Map<string, Date>();
  async consume(key: string, expiresAt: Date): Promise<boolean> {
    if (this.entries.has(key)) return false;
    this.entries.set(key, expiresAt);
    return true;
  }
}

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const OTHER_TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const OTHER_ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831b';
const TS = '1700000000';
const SECRET = 'webhook-http-secret';
const BODY = JSON.stringify({ tenantId: TENANT, technicalActorId: ACTOR, eventId: 'event-1' });
const staleFields = [
  'principal',
  'principalContext',
  'user',
  'actor',
  'stynxClaims',
  'tenantId',
  'actorId',
  'verifiedTenantClaim',
  'verifiedSessionId',
  'verifiedTenantEntitlement',
] as const;

type WebhookRequest = Record<string, unknown> & {
  rawBody?: Buffer;
  stynxClaims?: { sub: string; tenantId: string };
  headers: Record<string, unknown>;
};

function hasAuthMarker(req: object): boolean {
  return Object.getOwnPropertySymbols(req).some(
    (symbol) => symbol.description === 'stynx.verified-principal',
  );
}

function signature(body: string = BODY, secret = SECRET): string {
  return `sha256=${createHmac('sha256', secret).update(TS).update('.').update(Buffer.from(body)).digest('hex')}`;
}

function signedCall(app: INestApplication, body = BODY) {
  return request(app.getHttpServer())
    .post('/webhook/events')
    .set('content-type', 'application/json')
    .set('x-webhook-timestamp', TS)
    .set('x-webhook-signature', signature(body))
    .send(body);
}

@Controller('/webhook')
class WebhookController {
  constructor(private readonly context: RequestContext) {}

  @Post('/events')
  @HttpCode(200)
  @Public()
  @UseGuards(WebhookSignatureGuard)
  receive(@Req() req: WebhookRequest) {
    handled += 1;
    return {
      tenantId: this.context.tenantId,
      actorId: this.context.actorId,
      claims: req.stynxClaims,
      verifiedPublicTenantPrincipal:
        Reflect.get(req, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL) === true,
      verifiedAuthPrincipal: hasAuthMarker(req),
    };
  }
}

let handled = 0;
const seenRequests: WebhookRequest[] = [];
const verifiedSnapshots: Array<Record<string, unknown>> = [];
let callbackCalls = 0;
let activeMembership = true;

function databaseStub() {
  return {
    withSystemContext: async (_reason: string, run: () => Promise<unknown>) => run(),
    tx: async (
      run: (trx: {
        query: (sql: string, params?: string[]) => Promise<{ rows: Array<{ allowed: boolean }> }>;
      }) => Promise<unknown>,
    ) =>
      run({
        query: async (sql, params) => ({
          rows: [
            {
              allowed:
                activeMembership &&
                sql.includes('auth.memberships') &&
                params?.[0] === ACTOR &&
                params?.[1] === TENANT,
            },
          ],
        }),
      }),
  };
}

function baseOptions(store: SharedReplayStore) {
  return {
    secret: SECRET,
    clock: { now: () => new Date(1_700_000_000_000) },
    maxSkewMs: 300_000,
    replayStore: store,
    replayNamespace: 'backend-http',
    signatureHeaderName: 'X-Webhook-Signature',
    timestampHeaderName: 'X-Webhook-Timestamp',
    onVerified: (req: WebhookRequest) => {
      callbackCalls += 1;
      verifiedSnapshots.push(Object.fromEntries(staleFields.map((field) => [field, req[field]])));
      const body = JSON.parse(req.rawBody!.toString('utf8')) as {
        tenantId: string;
        technicalActorId: string;
      };
      req.stynxClaims = { sub: body.technicalActorId, tenantId: body.tenantId };
    },
  };
}

async function createApp(
  store: SharedReplayStore,
  config: { rawBody?: boolean; tenancy?: boolean; options?: Record<string, unknown> } = {},
): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [
      StynxCoreModule.forRoot({ appName: 'webhook-test', schema: z.object({}) }),
      ...(config.tenancy ? [StynxTenancyModule.forRoot({})] : []),
      StynxWebhookSignatureModule.forRoot({ ...baseOptions(store), ...config.options }),
    ],
    controllers: [WebhookController],
    providers: [
      { provide: APP_GUARD, useClass: StynxAuthGuard },
      {
        provide: StynxJwtValidator,
        useValue: {
          validate: async () => {
            throw new Error('public route must not validate bearer');
          },
        },
      },
      {
        provide: PermissionCache,
        useValue: {
          getForSession: async () => {
            throw new Error('public route must not load permissions');
          },
        },
      },
      { provide: Database, useValue: databaseStub() },
    ],
  }).compile();
  const app = module.createNestApplication({ rawBody: config.rawBody ?? true });
  app.use((req: WebhookRequest, _res: unknown, next: () => void) => {
    seenRequests.push(req);
    for (const field of staleFields)
      req[field] = field === 'verifiedTenantEntitlement' ? () => true : { forged: field };
    Reflect.set(req, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL, true);
    next();
  });
  await app.init();
  return app;
}

describe('UPS-HOOK-02 webhook guard HTTP contract', () => {
  const apps: INestApplication[] = [];
  beforeEach(() => {
    handled = 0;
    callbackCalls = 0;
    activeMembership = true;
    seenRequests.length = 0;
    verifiedSnapshots.length = 0;
  });
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it('uses rawBody and one atomic replay store across two real Nest applications', async () => {
    const store = new SharedReplayStore();
    const a = await createApp(store);
    const b = await createApp(store);
    apps.push(a, b);
    const responses = await Promise.all([signedCall(a), signedCall(b)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(handled).toBe(1);
    expect(callbackCalls).toBe(1);
    expect(store.entries.size).toBe(1);
    await signedCall(a).expect(401);
    expect(callbackCalls).toBe(1);
  });

  it('clears every stale identity before HMAC, replay and onVerified; failed HMAC reaches neither callback nor handler', async () => {
    const app = await createApp(new SharedReplayStore());
    apps.push(app);
    await signedCall(app).set('x-webhook-signature', signature(BODY, 'incorrect')).expect(401);
    expect(callbackCalls).toBe(0);
    expect(handled).toBe(0);
    const failed = seenRequests.at(-1)!;
    for (const field of staleFields) expect(failed).not.toHaveProperty(field);
    expect(Reflect.has(failed, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL)).toBe(false);
    expect(hasAuthMarker(failed)).toBe(false);

    const response = await signedCall(app).expect(200);
    expect(response.body.verifiedPublicTenantPrincipal).toBe(false);
    expect(response.body.verifiedAuthPrincipal).toBe(false);
    expect(verifiedSnapshots[0]).toEqual(
      Object.fromEntries(staleFields.map((field) => [field, undefined])),
    );
    const accepted = seenRequests.at(-1)!;
    expect(Reflect.has(accepted, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL)).toBe(false);
    expect(hasAuthMarker(accepted)).toBe(false);
  });

  it('reports 401 for missing raw body, invalid signature and replay', async () => {
    const withoutRaw = await createApp(new SharedReplayStore(), { rawBody: false });
    apps.push(withoutRaw);
    await signedCall(withoutRaw)
      .expect(401)
      .expect((response) => expect(response.body.message).toContain('MISSING_RAW_BODY'));
    const app = await createApp(new SharedReplayStore());
    apps.push(app);
    await signedCall(app)
      .set('x-webhook-signature', signature(BODY, 'incorrect'))
      .expect(401)
      .expect((response) => expect(response.body.message).toContain('INVALID_SIGNATURE'));
    await signedCall(app).expect(200);
    await signedCall(app)
      .expect(401)
      .expect((response) => expect(response.body.message).toContain('REPLAY'));
  });

  it('maps store failure to 503 and clock, message and onVerified failures to 500', async () => {
    for (const kind of ['store', 'clock', 'message', 'onVerified'] as const) {
      const store = new SharedReplayStore();
      const config =
        kind === 'store'
          ? {
              replayStore: {
                consume: async () => {
                  throw new Error('store offline');
                },
              },
            }
          : kind === 'clock'
            ? {
                clock: {
                  now: () => {
                    throw new Error('clock offline');
                  },
                },
              }
            : kind === 'message'
              ? {
                  message: () => {
                    throw new Error('message offline');
                  },
                }
              : {
                  onVerified: () => {
                    throw new Error('callback offline');
                  },
                };
      const app = await createApp(store, { options: config });
      apps.push(app);
      await signedCall(app).expect(kind === 'store' ? 503 : 500);
      expect(handled).toBe(0);
    }
  });

  it('fails bootstrap for missing or invalid configuration', async () => {
    for (const invalid of [{ secret: '' }, { replayNamespace: '' }, { maxSkewMs: 0 }]) {
      await expect(createApp(new SharedReplayStore(), { options: invalid })).rejects.toThrow();
    }
  });

  it('requires signed claims and active membership for non-optional tenancy paths', async () => {
    const app = await createApp(new SharedReplayStore(), { tenancy: true });
    apps.push(app);
    const success = await signedCall(app).expect(200);
    expect(success.body).toMatchObject({
      tenantId: TENANT,
      actorId: ACTOR,
      claims: { sub: ACTOR, tenantId: TENANT },
      verifiedPublicTenantPrincipal: false,
      verifiedAuthPrincipal: false,
    });
    expect(Reflect.has(seenRequests.at(-1)!, STYNX_VERIFIED_PUBLIC_TENANT_PRINCIPAL)).toBe(false);
    expect(hasAuthMarker(seenRequests.at(-1)!)).toBe(false);

    const differentBody = JSON.stringify({
      tenantId: TENANT,
      technicalActorId: ACTOR,
      eventId: 'event-2',
    });
    await signedCall(app, differentBody)
      .set('x-tenant-id', OTHER_TENANT)
      .expect(403)
      .expect((response) => expect(response.body.message).toBe('TENANT_ACCESS_DENIED'));
    const uppercaseBody = JSON.stringify({
      tenantId: TENANT,
      technicalActorId: ACTOR,
      eventId: 'event-3',
    });
    await signedCall(app, uppercaseBody)
      .set('x-tenant-id', TENANT.toUpperCase())
      .expect(403)
      .expect((response) => expect(response.body.message).toBe('TENANT_ACCESS_DENIED'));

    const bearerBody = JSON.stringify({
      tenantId: TENANT,
      technicalActorId: ACTOR,
      eventId: 'event-4',
    });
    const forged = Buffer.from(
      JSON.stringify({ sub: OTHER_ACTOR, tenant_id: OTHER_TENANT }),
    ).toString('base64url');
    await signedCall(app, bearerBody)
      .set('authorization', `Bearer x.${forged}.x`)
      .expect(200)
      .expect((response) =>
        expect(response.body).toMatchObject({ tenantId: TENANT, actorId: ACTOR }),
      );

    activeMembership = false;
    const noMembershipBody = JSON.stringify({
      tenantId: TENANT,
      technicalActorId: ACTOR,
      eventId: 'event-5',
    });
    await signedCall(app, noMembershipBody)
      .expect(403)
      .expect((response) => expect(response.body.message).toBe('TENANT_ACCESS_DENIED'));
  });

  it('does not establish RequestContext from X-Tenant-Id alone', async () => {
    const app = await createApp(new SharedReplayStore(), {
      tenancy: true,
      options: { onVerified: () => undefined },
    });
    apps.push(app);
    await signedCall(app).set('x-tenant-id', TENANT).expect(403);
    expect(handled).toBe(0);
  });
});
