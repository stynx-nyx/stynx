import 'reflect-metadata';
import {
  Controller,
  HttpCode,
  Post,
  Put,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { StynxCoreModule } from '@stynx-nyx/core';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { Idempotent, StynxIdempotencyModule } from '@stynx-nyx/idempotency';
import request from 'supertest';
import { z } from 'zod';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';
import * as backend from '../../src/index';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';

const TENANT_A = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const TENANT_B = '0197481e-6f84-77e4-8d6d-41f0b6fca9c2';
const ACTOR_A = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const ACTOR_B = '0197481e-7294-7c53-8b03-5c36d7c2831b';

type CommandApi = {
  TransactionalCommand: (options?: Record<string, unknown>) => MethodDecorator;
  StynxTransactionalCommandModule: { forRoot(options: Record<string, unknown>): unknown };
};

const asRole = (connectionString: string, role: 'stynx_app' | 'stynx_reader'): string =>
  `${connectionString}&options=${encodeURIComponent(`-c role=${role}`)}`;

function expectConflictEnvelope(response: { status: number; body: unknown; headers: Record<string, string | undefined> }, key: string, errorCode = 'IDEMPOTENCY:CONFLICT:duplicate-key'): void {
  expect(response.status).toBe(409);
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  expect(response.body).toEqual({ statusCode: 409, errorCode,
    message: 'Idempotency key was used for a different request', requestId, details: { key }, retryable: false });
}

const tokenVerifier = {
  verifyAuthorizationHeader: async (header?: string | string[]) => {
    const isB = header === 'Bearer tenant-b';
    const tenantId = isB ? TENANT_B : TENANT_A;
    const actorId = isB ? ACTOR_B : ACTOR_A;
    return {
      principal: {
        id: actorId,
        roles: ['member'],
        permissions: [],
        tenants: [tenantId],
        claims: { tenant_id: tenantId },
      },
    };
  },
};

const cache = {
  get: async () => null,
  set: async () => undefined,
  acquireLock: async () => true,
  releaseLock: async () => undefined,
  isLocked: async () => false,
};

class SpoofClaimsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ stynxClaims?: { sub: string; tenantId: string } }>();
    req.stynxClaims = { sub: ACTOR_B, tenantId: TENANT_A };
    return true;
  }
}

describe('transactional command fingerprint and app-role isolation over real Nest HTTP/PostgreSQL', () => {
  let postgres: PostgresTestDatabase | undefined;
  let app: INestApplication | undefined;
  const calls = new Map<string, number>();
  const sessions: Array<{
    user: string;
    role: string;
    tenant: string;
    actor: string;
    visible: string[];
    foreignUpdates: number;
  }> = [];

  beforeAll(async () => {
    const api = backend as unknown as Partial<CommandApi>;
    expect(api.TransactionalCommand).toBeTypeOf('function');
    expect(api.StynxTransactionalCommandModule?.forRoot).toBeTypeOf('function');

    @Controller('/advanced-command')
    @UseGuards(AuthContextGuard)
    class CommandController {
      constructor(private readonly database: Database) {}

      private async execute(label: string) {
        calls.set(label, (calls.get(label) ?? 0) + 1);
        return this.database.tx(
          async (trx) => {
            const identity = await trx.query<{
              user: string;
              role: string;
              tenant: string;
              actor: string;
            }>(
              "select current_user as user, current_setting('app.role', true) as role, current_setting('app.tenant_id', true) as tenant, current_setting('app.actor_id', true) as actor",
            );
            const rows = await trx.query<{ tenant_id: string }>(
              'select tenant_id::text from core.command_advanced_probes order by tenant_id',
            );
            const foreignUpdate = await trx.query(
              `update core.command_advanced_probes set note = 'invisible mutation'
             where tenant_id <> nullif(current_setting('app.tenant_id', true), '')::uuid returning id`,
            );
            const session = {
              ...identity.rows[0]!,
              visible: rows.rows.map((row) => row.tenant_id),
              foreignUpdates: foreignUpdate.rowCount ?? -1,
            };
            sessions.push(session);
            return { label, invocation: calls.get(label), ...session };
          },
          { role: 'app', requireActor: true },
        );
      }

      @Post('/item/:id')
      postItem() {
        return this.execute('post-item');
      }

      @Put('/item/:id')
      putItem() {
        return this.execute('put-item');
      }

      @Post('/canonical')
      canonical() {
        return this.execute('canonical');
      }

      @Post('/bodyless')
      bodyless() {
        return this.execute('bodyless');
      }

      @Post('/scoped')
      @HttpCode(202)
      scoped() {
        return this.execute('scoped');
      }

      @Post('/spoofed-claims')
      @UseGuards(SpoofClaimsGuard)
      spoofedClaims() {
        return this.execute('spoofed-claims');
      }
    }

    for (const method of [
      'postItem',
      'putItem',
      'canonical',
      'bodyless',
      'scoped',
      'spoofedClaims',
    ] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(CommandController.prototype, method)!;
      const options =
        method === 'scoped'
          ? {
              scope: ({
                request: req,
              }: {
                request: { headers: Record<string, string | undefined> };
              }) => req.headers['x-command-scope'] ?? '',
              mismatchCode: 'SCOPED:CONFLICT:command-mismatch',
              persistStatus: ({ statusCode }: { statusCode: number }) => statusCode === 202,
            }
          : {};
      api.TransactionalCommand!(options)(CommandController.prototype, method, descriptor);
      (Idempotent as unknown as (options: { transactional: true }) => MethodDecorator)({
        transactional: true,
      })(CommandController.prototype, method, descriptor);
      backend.Audit({
        action: `command.advanced.${method}`,
        entity: 'command',
        transactional: true,
      } as never)(CommandController.prototype, method, descriptor);
    }

    postgres = await createPostgresTestDatabase('stynx_command_advanced');
    const auditSink = new AuditSqlSink(
      {
        query: async () => {
          throw new Error('legacy audit path used');
        },
      },
      { mode: 'audit_write_function' },
    );
    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'advanced-command', schema: z.object({}) }),
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('advanced-command-owner') },
            app: {
              connectionString: postgres.appConnectionString('advanced-command-app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('advanced-command-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
        }),
        StynxAuthModule.forRoot({ tokenVerifier }),
        StynxIdempotencyModule.forRoot({ backend: cache }),
        api.StynxTransactionalCommandModule!.forRoot({ auditSink }) as never,
      ],
      controllers: [CommandController],
    }).compile();
    app = testing.createNestApplication();
    await app.init();
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values ($1, 'advanced-a', 'Advanced A', true, clock_timestamp(), clock_timestamp()),
               ($2, 'advanced-b', 'Advanced B', true, clock_timestamp(), clock_timestamp())`,
        [TENANT_A, TENANT_B],
      );
      await admin.query(`create table core.command_advanced_probes (
        id text primary key, tenant_id uuid not null references tenancy.tenants(id), note text not null
      )`);
      await admin.query(`alter table core.command_advanced_probes enable row level security`);
      await admin.query(`alter table core.command_advanced_probes force row level security`);
      await admin.query(`create policy command_advanced_tenant on core.command_advanced_probes
        using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
        with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)`);
      await admin.query(
        `grant select, insert, update, delete on core.command_advanced_probes to stynx_app`,
      );
      await admin.query(
        `insert into core.command_advanced_probes (id, tenant_id, note)
        values ('a', $1, 'A only'), ('b', $2, 'B only')`,
        [TENANT_A, TENANT_B],
      );
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.dispose();
  });

  const send = (method: 'post' | 'put', path: string, key: string, tenant: 'a' | 'b' = 'a') => {
    const client = request(app!.getHttpServer());
    return client[method](path)
      .set('authorization', tenant === 'a' ? 'Bearer tenant-a' : 'Bearer tenant-b')
      .set('idempotency-key', key);
  };

  it('commits and replays exact wire bytes under the actual app role while RLS isolates two tenants sharing a key', async () => {
    const firstA = await send('post', '/advanced-command/item/one', 'shared-tenants').send({
      value: 1,
    });
    const firstB = await send('post', '/advanced-command/item/one', 'shared-tenants', 'b').send({
      value: 1,
    });
    const replayA = await send('post', '/advanced-command/item/one', 'shared-tenants').send({
      value: 1,
    });
    expect(firstA.status).toBe(201);
    expect(firstB.status).toBe(201);
    expect(replayA.status).toBe(firstA.status);
    expect(replayA.text).toBe(firstA.text);
    expect(replayA.headers['content-type']).toBe(firstA.headers['content-type']);
    expect(replayA.headers['idempotency-replayed']).toBe('true');
    expect(calls.get('post-item')).toBe(2);
    expect(firstA.body).toMatchObject({
      user: 'stynx_app',
      role: 'app',
      tenant: TENANT_A,
      actor: ACTOR_A,
      visible: [TENANT_A],
      foreignUpdates: 0,
    });
    expect(firstB.body).toMatchObject({
      user: 'stynx_app',
      role: 'app',
      tenant: TENANT_B,
      actor: ACTOR_B,
      visible: [TENANT_B],
      foreignUpdates: 0,
    });
    expect(sessions).toHaveLength(2);
    const admin = await postgres!.connectAsAdmin();
    try {
      const keys = await admin.query<{ tenant_id: string; count: string }>(
        'select tenant_id::text, count(*)::text from core.idempotency_keys where tenant_id in ($1, $2) group by tenant_id order by tenant_id',
        [TENANT_A, TENANT_B],
      );
      expect(keys.rows).toEqual([
        { tenant_id: TENANT_A, count: '1' },
        { tenant_id: TENANT_B, count: '1' },
      ]);
    } finally {
      await admin.end();
    }
  });

  it('fingerprints method and concrete path, and canonicalizes parsed JSON without treating a bodyless request as {}', async () => {
    await send('post', '/advanced-command/item/method', 'method-mismatch')
      .send({ value: 1 })
      .expect(201);
    const method = await send('put', '/advanced-command/item/method', 'method-mismatch').send({
      value: 1,
    });
    expectConflictEnvelope(method, 'method-mismatch');
    const pathFirst = await send('post', '/advanced-command/item/1', 'path-mismatch').send({
      value: 1,
    });
    const pathSecond = await send('post', '/advanced-command/item/2', 'path-mismatch').send({
      value: 1,
    });
    expect(pathFirst.status).toBe(201);
    expectConflictEnvelope(pathSecond, 'path-mismatch');
    const canonicalA = await send('post', '/advanced-command/canonical', 'canonical-keys')
      .set('content-type', 'application/json')
      .send('{"z":3,"a":{"y":2,"x":1}}');
    const canonicalB = await send('post', '/advanced-command/canonical', 'canonical-keys')
      .set('content-type', 'application/json')
      .send('{"a":{"x":1,"y":2},"z":3}');
    expect(canonicalA.status).toBe(201);
    expect(canonicalB.status).toBe(201);
    expect(canonicalB.text).toBe(canonicalA.text);
    expect(calls.get('canonical')).toBe(1);
    const bodyless = await send('post', '/advanced-command/bodyless', 'bodyless').then(
      (response) => response,
    );
    const bodylessReplay = await send('post', '/advanced-command/bodyless', 'bodyless').then(
      (response) => response,
    );
    const explicitEmpty = await send('post', '/advanced-command/bodyless', 'bodyless').send({});
    expect(bodyless.status).toBe(201);
    expect(bodylessReplay.text).toBe(bodyless.text);
    expectConflictEnvelope(explicitEmpty, 'bodyless');
    expect(calls.get('bodyless')).toBe(1);
    expect(calls.has('put-item')).toBe(false);
  });

  it('uses configured scope, mismatch code and status policy without crossing scopes', async () => {
    const scoped = (scope: string, body: unknown) =>
      send('post', '/advanced-command/scoped', 'scope-shared')
        .set('x-command-scope', scope)
        .send(body);
    const one = await scoped('one', { amount: 1 });
    const two = await scoped('two', { amount: 2 });
    const replay = await scoped('one', { amount: 1 });
    const conflict = await scoped('one', { amount: 3 });
    expect(one.status).toBe(202);
    expect(two.status).toBe(202);
    expect(replay.status).toBe(202);
    expect(replay.text).toBe(one.text);
    expectConflictEnvelope(conflict, 'scope-shared', 'SCOPED:CONFLICT:command-mismatch');
    expect(calls.get('scoped')).toBe(2);
    const missingScope = await send('post', '/advanced-command/scoped', 'scope-missing').send({
      amount: 1,
    });
    expect(missingScope.status).toBe(400);
    expect(calls.get('scoped')).toBe(2);
  });

  it('rejects foreign tenant selection and actor-claim mismatch before handler or command SQL', async () => {
    const before = sessions.length;
    const foreignTenant = await send('post', '/advanced-command/item/foreign', 'foreign-tenant')
      .set('x-tenant-id', TENANT_B)
      .send({ value: 1 });
    expect(foreignTenant.status).toBeGreaterThanOrEqual(400);
    expect(foreignTenant.status).toBeLessThan(500);
    const spoof = await send('post', '/advanced-command/spoofed-claims', 'spoofed-actor').send({
      value: 1,
    });
    expect(spoof.status).toBe(403);
    const requestId = spoof.headers['x-request-id'];
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
    expect(spoof.body).toEqual({ statusCode: 403, errorCode: 'COMMAND:FORBIDDEN:actor-provenance-invalid',
      message: 'Trusted actor provenance is invalid', requestId, retryable: false });
    expect(sessions).toHaveLength(before);
    expect(calls.has('spoofed-claims')).toBe(false);
  });

  it('rejects a reader-backed app pool before entering a command handler', async () => {
    const api = backend as unknown as CommandApi;
    const wrongRoleHandler = vi.fn(() => ({ mustNotCommit: true }));

    @Controller('/advanced-wrong-role')
    @UseGuards(AuthContextGuard)
    class WrongRoleController {
      @Post()
      command() {
        return wrongRoleHandler();
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(WrongRoleController.prototype, 'command')!;
    api.TransactionalCommand()(WrongRoleController.prototype, 'command', descriptor);
    (Idempotent as unknown as (options: { transactional: true }) => MethodDecorator)({
      transactional: true,
    })(WrongRoleController.prototype, 'command', descriptor);
    backend.Audit({
      action: 'command.advanced.wrongRole',
      entity: 'command',
      transactional: true,
    } as never)(WrongRoleController.prototype, 'command', descriptor);

    const auditSink = new AuditSqlSink(
      {
        query: async () => {
          throw new Error('legacy audit path used');
        },
      },
      { mode: 'audit_write_function' },
    );
    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'advanced-wrong-role', schema: z.object({}) }),
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres!.connectionString('advanced-wrong-role-owner') },
            app: {
              connectionString: asRole(
                postgres!.connectionString('advanced-wrong-role-app'),
                'stynx_reader',
              ),
            },
            reader: {
              connectionString: asRole(
                postgres!.connectionString('advanced-wrong-role-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: false },
        }),
        StynxAuthModule.forRoot({ tokenVerifier }),
        StynxIdempotencyModule.forRoot({ backend: cache }),
        api.StynxTransactionalCommandModule.forRoot({ auditSink }) as never,
      ],
      controllers: [WrongRoleController],
    }).compile();
    const wrongRoleApp = testing.createNestApplication();
    try {
      // ADR-OUTBOX-0003 D1 item 7: a pool whose current_user is not the configured
      // application role is refused at startup, before any request can reach the
      // live-identity check that used to answer 500 TRANSACTION_IDENTITY_MISMATCH.
      let refusal: unknown;
      try {
        await wrongRoleApp.init();
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toMatchObject({
        code: 'APP_ROLE_CONFIGURATION',
        message: 'Application SQL role check failed: current_user',
        context: { property: 'current_user', role: 'stynx_app', actual: 'stynx_reader' },
      });
      expect(wrongRoleHandler).not.toHaveBeenCalled();
      const admin = await postgres!.connectAsAdmin();
      try {
        const key = await admin.query<{ count: string }>(
          "select count(*)::text from core.idempotency_keys where key like '%wrong-pool-role%'",
        );
        const audit = await admin.query<{ count: string }>(
          "select count(*)::text from audit.events where operation = 'command.advanced.wrongRole'",
        );
        expect(key.rows[0]?.count).toBe('0');
        expect(audit.rows[0]?.count).toBe('0');
      } finally {
        await admin.end();
      }
    } finally {
      await wrongRoleApp.close();
    }
  });
});
