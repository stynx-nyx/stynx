import 'reflect-metadata';
import { Controller, Global, Module, Post, UseGuards, type CanActivate, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PublicTenantRoute } from '@stynx-nyx/auth';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { StynxCoreModule } from '@stynx-nyx/core';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { Idempotent, StynxIdempotencyModule } from '@stynx-nyx/idempotency';
import { StynxTenancyModule } from '@stynx-nyx/tenancy';
import request from 'supertest';
import { z } from 'zod';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';
import { Audit, AuthContextGuard as BuiltinAuthContextGuard, StynxAuthModule, StynxTransactionalCommandModule, TransactionalCommand } from '../../src/index';

const TENANT_A = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const TENANT_B = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const ACTOR_A = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const ACTOR_B = '0197481e-7294-7c53-8b03-5c36d7c2831b';
const NOMINAL_ACTOR = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';

const asRole = (url: string, role: 'stynx_app' | 'stynx_reader') => `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;
const cache = { get: async () => null, set: async () => undefined, acquireLock: async () => true,
  releaseLock: async () => undefined, isLocked: async () => false };
const tokenVerifier = { verifyAuthorizationHeader: async (header?: string | string[]) => {
  if (header !== 'Bearer a' && header !== 'Bearer b') return null;
  const tenantId = header === 'Bearer a' ? TENANT_A : TENANT_B;
  const actorId = header === 'Bearer a' ? ACTOR_A : ACTOR_B;
  return { principal: { id: actorId, roles: ['member'], permissions: [], tenants: [tenantId], claims: { tenant_id: tenantId } } };
} };

const handlerCalls: Array<{ tenant: string; actor: string; route: string }> = [];

@Controller('/provenance-command')
class ProvenanceController {
  constructor(private readonly database: Database) {}

  private async execute(route: string) {
    return this.database.tx(async (trx) => {
      const result = await trx.query<{ user: string; role: string; tenant: string; actor: string }>(
        "select current_user as user, current_setting('app.role', true) as role, current_setting('app.tenant_id', true) as tenant, current_setting('app.actor_id', true) as actor",
      );
      const visibleAudit = await trx.query<{ tenant: string }>(
        'select distinct tenancy_id::text as tenant from audit.events order by tenant');
      const visibleKeys = await trx.query<{ tenant: string }>(
        'select distinct tenant_id::text as tenant from core.idempotency_keys order by tenant');
      const row = result.rows[0]!;
      handlerCalls.push({ tenant: row.tenant, actor: row.actor, route });
      return { ...row, route,
        visibleAuditTenants: visibleAudit.rows.map((item) => item.tenant),
        visibleKeyTenants: visibleKeys.rows.map((item) => item.tenant) };
    }, { role: 'app', requireActor: true });
  }

  @Post('/nominal')
  @PublicTenantRoute()
  @TransactionalCommand({ scope: () => 'public' })
  @Idempotent({ transactional: true })
  @Audit({ action: 'provenance.nominal', transactional: true })
  nominal() { return this.execute('nominal'); }

  @Post('/verified')
  @UseGuards(BuiltinAuthContextGuard)
  @PublicTenantRoute({ optionalAuth: true })
  @TransactionalCommand({ scope: () => 'public' })
  @Idempotent({ transactional: true })
  @Audit({ action: 'provenance.verified', transactional: true })
  verified() { return this.execute('verified'); }

  @Post('/protected')
  @UseGuards(BuiltinAuthContextGuard)
  @TransactionalCommand()
  @Idempotent({ transactional: true })
  @Audit({ action: 'provenance.protected', transactional: true })
  protected() { return this.execute('protected'); }

  @Post('/invalid-scope')
  @PublicTenantRoute()
  @TransactionalCommand({ scope: () => '' })
  @Idempotent({ transactional: true })
  @Audit({ action: 'provenance.invalid-scope', transactional: true })
  invalidScope() { return this.execute('invalid-scope'); }

  @Post('/invalid-option')
  @PublicTenantRoute()
  @TransactionalCommand({ scope: () => 'public', mismatchCode: '' })
  @Idempotent({ transactional: true })
  @Audit({ action: 'provenance.invalid-option', transactional: true })
  invalidOption() { return this.execute('invalid-option'); }
}

function commandSink() {
  return new AuditSqlSink({ query: async () => { throw new Error('legacy audit executor reached'); } },
    { mode: 'audit_write_function' });
}

function modules(postgres: PostgresTestDatabase, order: 'correct' | 'command-before-tenancy') {
  const core = StynxCoreModule.forRoot({ appName: `command-provenance-${order}`, schema: z.object({}) });
  const data = StynxDataModule.forRoot({ connections: {
    owner: { connectionString: postgres.connectionString('provenance-owner') },
    app: { connectionString: asRole(postgres.connectionString('provenance-app'), 'stynx_app') },
    reader: { connectionString: asRole(postgres.connectionString('provenance-reader'), 'stynx_reader') },
  }, migrations: { enabled: true } });
  const auth = StynxAuthModule.forRoot({ tokenVerifier });
  const tenancy = StynxTenancyModule.forRoot({ publicTenant: {
    actorId: NOMINAL_ACTOR,
    resolveHost: ({ host }) => host === 'a.portal.test' ? TENANT_A : host === 'b.portal.test' ? TENANT_B : undefined,
  } });
  const idempotency = StynxIdempotencyModule.forRoot({ backend: cache });
  const command = StynxTransactionalCommandModule.forRoot({ auditSink: commandSink() });
  return order === 'correct'
    ? [core, data, auth, tenancy, idempotency, command]
    : [core, data, auth, idempotency, command, tenancy];
}

async function counts(postgres: PostgresTestDatabase, action: string) {
  const admin = await postgres.connectAsAdmin();
  try {
    const events = await admin.query<{ tenant: string; count: string }>(
      `select tenancy_id::text as tenant, count(*)::text from audit.events where operation = $1
       group by tenancy_id order by tenancy_id`, [action]);
    const keys = await admin.query<{ tenant: string; count: string }>(
      `select tenant_id::text as tenant, count(*)::text from core.idempotency_keys
       where tenant_id in ($1, $2) group by tenant_id order by tenant_id`, [TENANT_A, TENANT_B]);
    return { events: events.rows.map((row) => [row.tenant, Number(row.count)]),
      keys: keys.rows.map((row) => [row.tenant, Number(row.count)]) };
  } finally { await admin.end(); }
}

describe('transactional command tenancy provenance over real Nest HTTP/PostgreSQL', () => {
  let postgres: PostgresTestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_command_provenance');
    const testing = await Test.createTestingModule({ imports: modules(postgres, 'correct'), controllers: [ProvenanceController] }).compile();
    app = testing.createNestApplication();
    await app.init();
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(`insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values ($1, 'provenance-a', 'Provenance A', true, clock_timestamp(), clock_timestamp()),
               ($2, 'provenance-b', 'Provenance B', true, clock_timestamp(), clock_timestamp())`, [TENANT_A, TENANT_B]);
      await admin.query(`insert into auth.users (id, email, created_at, updated_at) values
        ($1, 'provenance-a@example.test', clock_timestamp(), clock_timestamp()),
        ($2, 'provenance-b@example.test', clock_timestamp(), clock_timestamp())`, [ACTOR_A, ACTOR_B]);
      await admin.query(`insert into auth.memberships (id, tenant_id, user_id, is_active, created_at) values
        ('0197481e-7294-7c53-8b03-5c36d7c2832a', $1, $2, true, clock_timestamp()),
        ('0197481e-7294-7c53-8b03-5c36d7c2832b', $3, $4, true, clock_timestamp())`,
      [TENANT_A, ACTOR_A, TENANT_B, ACTOR_B]);
    } finally { await admin.end(); }
  }, 90_000);

  afterAll(async () => { await app?.close(); await postgres?.dispose(); });

  it('commits nominal public commands for two Host tenants with the configured actor, audit and distinct keys', async () => {
    for (const [host, tenant] of [['a.portal.test', TENANT_A], ['b.portal.test', TENANT_B]] as const) {
      const first = await request(app.getHttpServer()).post('/provenance-command/nominal').set('host', host)
        .set('idempotency-key', 'nominal-shared').send({ value: 1 });
      const replay = await request(app.getHttpServer()).post('/provenance-command/nominal').set('host', host)
        .set('idempotency-key', 'nominal-shared').send({ value: 1 });
      expect(first.status).toBe(201);
      expect(first.headers['x-idempotency-key']).toBe('nominal-shared');
      expect(first.body).toMatchObject({ user: 'stynx_app', role: 'app', tenant, actor: NOMINAL_ACTOR });
      expect(replay.text).toBe(first.text);
      expect(replay.headers['x-idempotency-key']).toBe('nominal-shared');
      expect(replay.headers['idempotency-replayed']).toBe('true');
    }
    expect(handlerCalls.filter((call) => call.route === 'nominal')).toHaveLength(2);
    expect((await counts(postgres, 'provenance.nominal')).events).toEqual([[TENANT_A, 1], [TENANT_B, 1]]);
    expect((await counts(postgres, 'provenance.nominal')).keys).toEqual([[TENANT_A, 1], [TENANT_B, 1]]);
  });

  it('commits verified optional-auth public commands under the Host tenant and verified actor', async () => {
    for (const [host, token, tenant, actor] of [
      ['a.portal.test', 'a', TENANT_A, ACTOR_A], ['b.portal.test', 'b', TENANT_B, ACTOR_B],
    ] as const) {
      const response = await request(app.getHttpServer()).post('/provenance-command/verified')
        .set('host', host).set('authorization', `Bearer ${token}`).set('idempotency-key', 'verified-shared')
        .send({ value: 1 });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ user: 'stynx_app', role: 'app', tenant, actor });
      expect((response.body.visibleAuditTenants as Array<string | null>).filter(Boolean)).toEqual([tenant]);
      expect(response.body.visibleKeyTenants).toEqual([tenant]);
    }
    expect(handlerCalls.filter((call) => call.route === 'verified')).toHaveLength(2);
    expect((await counts(postgres, 'provenance.verified')).events).toEqual([[TENANT_A, 1], [TENANT_B, 1]]);
  });

  it('commits protected commands only after tenancy attests the checked member', async () => {
    const response = await request(app.getHttpServer()).post('/provenance-command/protected')
      .set('authorization', 'Bearer a').set('x-tenant-id', TENANT_A).set('idempotency-key', 'protected-a')
      .send({ value: 1 });
    expect(response.status).toBe(201);
    expect(response.headers['x-idempotency-key']).toBe('protected-a');
    expect(response.body).toMatchObject({ user: 'stynx_app', role: 'app', tenant: TENANT_A, actor: ACTOR_A });
    expect((response.body.visibleAuditTenants as Array<string | null>).filter(Boolean)).toEqual([TENANT_A]);
    expect(response.body.visibleKeyTenants).toEqual([TENANT_A]);
    expect((await counts(postgres, 'provenance.protected')).events).toEqual([[TENANT_A, 1]]);
  });

  it('rejects a token for tenant A paired with tenant B before the handler, key or audit', async () => {
    const before = handlerCalls.length;
    const durableBefore = await counts(postgres, 'provenance.protected');
    const response = await request(app.getHttpServer()).post('/provenance-command/protected')
      .set('authorization', 'Bearer a').set('x-tenant-id', TENANT_B)
      .set('idempotency-key', 'protected-cross-tenant').send({ value: 1 });
    expect(response.status).toBe(403);
    expect(response.headers).not.toHaveProperty('x-idempotency-key');
    expect(handlerCalls).toHaveLength(before);
    expect(await counts(postgres, 'provenance.protected')).toEqual(durableBefore);
  });

  it.each([
    ['/invalid-scope', 400, 'COMMAND_SCOPE_INVALID', 'provenance.invalid-scope'],
    ['/invalid-option', 500, 'COMMAND_MISMATCH_CODE_INVALID', 'provenance.invalid-option'],
  ] as const)('rejects %s without echoing a key or writing an audit or reservation', async (path, status, code, action) => {
    const before = handlerCalls.length;
    const durableBefore = await counts(postgres, action);
    const response = await request(app.getHttpServer()).post(`/provenance-command${path}`)
      .set('host', 'a.portal.test').set('idempotency-key', `rejected-${status}`)
      .send({ value: 1 });
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ code });
    expect(response.headers).not.toHaveProperty('x-idempotency-key');
    expect(handlerCalls).toHaveLength(before);
    expect(await counts(postgres, action)).toEqual(durableBefore);
  });

  it('fails core → command → tenancy ordering before the handler, audit event or key', async () => {
    const testing = await Test.createTestingModule({
      imports: modules(postgres, 'command-before-tenancy'), controllers: [ProvenanceController],
    }).compile();
    const wrongApp = testing.createNestApplication();
    try {
      await wrongApp.init();
      const database = testing.get(Database);
      const commandTx = vi.spyOn(database, 'tx');
      const before = handlerCalls.length;
      const keysBefore = (await counts(postgres, 'provenance.protected')).keys;
      const response = await request(wrongApp.getHttpServer()).post('/provenance-command/protected')
        .set('authorization', 'Bearer a').set('x-tenant-id', TENANT_A).set('idempotency-key', 'wrong-order')
        .send({ value: 1 });
      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({ code: 'COMMAND_TENANT_PROVENANCE_INVALID' });
      expect(response.headers).not.toHaveProperty('x-idempotency-key');
      expect(handlerCalls).toHaveLength(before);
      expect(commandTx.mock.calls.filter(([, options]) => options?.requireActor === true)).toHaveLength(0);
      expect((await counts(postgres, 'provenance.protected')).keys).toEqual(keysBefore);
      expect((await counts(postgres, 'provenance.protected')).events).toEqual([[TENANT_A, 1]]);
    } finally { await wrongApp.close(); }
  });
});

describe('transactional command provenance bootstrap', () => {
  @Global()
  @Module({ providers: [{ provide: Database, useValue: {} }], exports: [Database] })
  class FakeDatabaseModule {}

  async function bootstrap(controller: typeof PublicController | typeof ProtectedController,
    globalGuard?: BuiltinAuthContextGuard, includeAuth = false) {
    const testing = await Test.createTestingModule({
      imports: [StynxCoreModule.forRoot({ appName: 'provenance-bootstrap', schema: z.object({}) }),
        FakeDatabaseModule,
        ...(includeAuth ? [StynxAuthModule.forRoot({ tokenVerifier })] : []),
        StynxTransactionalCommandModule.forRoot({ auditSink: commandSink() })],
      controllers: [controller],
    }).compile();
    const app = testing.createNestApplication();
    if (globalGuard) app.useGlobalGuards(globalGuard);
    return app;
  }

  @Controller('/missing-port')
  class PublicController {
    @Post()
    @PublicTenantRoute()
    @TransactionalCommand()
    @Idempotent({ transactional: true })
    @Audit({ action: 'missing.port', transactional: true })
    run() { return { ok: false }; }
  }

  @Controller('/unbranded')
  class ProtectedController {
    @Post()
    @TransactionalCommand()
    @Idempotent({ transactional: true })
    @Audit({ action: 'unbranded.protected', transactional: true })
    run() { return { ok: false }; }
  }

  it('rejects a public command when the tenancy port provider is absent', async () => {
    const missing = await bootstrap(PublicController);
    try { await expect(missing.init()).rejects.toThrow(/tenancy port/i); }
    finally { await missing.close(); }
  });

  it('rejects a same-name look-alike guard, an inheriting subclass and imperative useGlobalGuards-only registration', async () => {
    class AuthContextGuard implements CanActivate { canActivate(): boolean { return true; } }
    class InheritedGuard extends BuiltinAuthContextGuard {}
    for (const guard of [AuthContextGuard, InheritedGuard]) {
      @Controller('/unbranded-route')
      @UseGuards(guard)
      class UnbrandedController {
        @Post()
        @TransactionalCommand()
        @Idempotent({ transactional: true })
        @Audit({ action: 'unbranded.protected', transactional: true })
        run() { return { ok: false }; }
      }
      const app = await bootstrap(UnbrandedController, undefined, true);
      try { await expect(app.init()).rejects.toThrow(/built-in STYNX auth guard/i); }
      finally { await app.close(); }
    }
    const globalOnly = await bootstrap(ProtectedController, new BuiltinAuthContextGuard(tokenVerifier), true);
    try { await expect(globalOnly.init()).rejects.toThrow(/built-in STYNX auth guard/i); }
    finally { await globalOnly.close(); }
  });
});
