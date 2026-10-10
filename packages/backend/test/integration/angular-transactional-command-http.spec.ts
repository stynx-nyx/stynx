import 'reflect-metadata';
import '../../../../packages-web/angular/node_modules/@angular/compiler/fesm2022/compiler.mjs';
import {
  Controller,
  Post,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { StynxCoreModule } from '@stynx-nyx/core';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { Idempotent, StynxIdempotencyModule } from '@stynx-nyx/idempotency';
import { firstValueFrom, from, mergeMap } from 'rxjs';
import { z } from 'zod';
import { HttpContext, HttpHeaders, HttpRequest } from '../../../../packages-web/angular/node_modules/@angular/common/fesm2022/http.mjs';
import { IdempotencyKeyInterceptor, STYNX_IDEMPOTENCY_COMMAND } from '../../../../packages-web/angular/src/idempotency';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';
import { Audit, StynxTransactionalCommandModule, TransactionalCommand } from '../../src/index';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9e5';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2832e';
const GENERATED_KEY = 'command.create:record-7:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777';
const asRole = (connectionString: string, role: 'stynx_app' | 'stynx_reader'): string =>
  `${connectionString}&options=${encodeURIComponent(`-c role=${role}`)}`;

describe('Angular NGIDEM to transactional command over live HTTP and PostgreSQL', () => {
  let postgres: PostgresTestDatabase | undefined;
  let app: INestApplication | undefined;
  let url: string;
  const handler = vi.fn();

  beforeAll(async () => {
    @Controller('/ngidem-command')
    @UseGuards(AuthContextGuard)
    class CommandController {
      constructor(private readonly database: Database) {}

      @Post()
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.ngidem', entity: 'command', transactional: true })
      async command() {
        handler();
        const identity = await this.database.tx(async (trx) => {
          const result = await trx.query<{ user: string; tenant: string; actor: string }>(
            "select current_user as user, current_setting('app.tenant_id', true) as tenant, current_setting('app.actor_id', true) as actor",
          );
          return result.rows[0];
        }, { role: 'app', requireActor: true });
        expect(identity).toEqual({ user: 'stynx_app', tenant: TENANT, actor: ACTOR });
        return { accepted: true, invocation: handler.mock.calls.length };
      }
    }

    postgres = await createPostgresTestDatabase('stynx_ngidem_http');
    const auditSink = new AuditSqlSink({
      query: async () => { throw new Error('legacy audit path used'); },
    }, { mode: 'audit_write_function' });
    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'ngidem-command', schema: z.object({}) }),
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ngidem-owner') },
            app: { connectionString: postgres.appConnectionString('ngidem-app') },
            reader: { connectionString: asRole(postgres.connectionString('ngidem-reader'), 'stynx_reader') },
          },
          migrations: { enabled: true },
        }),
        StynxAuthModule.forRoot({ tokenVerifier: {
          verifyAuthorizationHeader: async () => ({ principal: {
            id: ACTOR, roles: ['member'], permissions: [], tenants: [TENANT],
            claims: { tenant_id: TENANT },
          } }),
        } }),
        StynxIdempotencyModule.forRoot({ backend: {
          get: async () => null, set: async () => undefined,
          acquireLock: async () => true, releaseLock: async () => undefined,
          isLocked: async () => false,
        } }),
        StynxTransactionalCommandModule.forRoot({ auditSink }),
      ],
      controllers: [CommandController],
    }).compile();
    app = testing.createNestApplication();
    await app.listen(0, '127.0.0.1');
    url = `${await app.getUrl()}/ngidem-command`;
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
         values ($1, 'ngidem-http', 'NGIDEM HTTP', true, clock_timestamp(), clock_timestamp())`,
        [TENANT],
      );
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.dispose();
  }, 60_000);

  it('replays the same generated key and returns the CTG5 mismatch envelope for a changed body', async () => {
    const interceptor = new IdempotencyKeyInterceptor();
    const generated = new Set<string>();
    const send = async (body: Record<string, unknown>, reuseKey?: string) => {
      const context = new HttpContext().set(STYNX_IDEMPOTENCY_COMMAND,
        reuseKey ? { key: reuseKey } : { action: 'command.create', target: 'record-7', includeBodyHash: true });
      const request = new HttpRequest('POST', url, body, {
        context,
        headers: new HttpHeaders({ Authorization: 'Bearer verified', 'Content-Type': 'application/json' }),
      });
      return firstValueFrom(interceptor.intercept(request, {
        handle: (outbound) => from(fetch(outbound.url, {
          method: outbound.method,
          headers: Object.fromEntries(outbound.headers.keys().map((name) => [name, outbound.headers.get(name)!])),
          body: JSON.stringify(outbound.body),
        })).pipe(mergeMap(async (response) => {
          const key = outbound.headers.get('Idempotency-Key');
          expect(key).toBe(reuseKey ?? GENERATED_KEY);
          generated.add(key ?? '');
          return { status: response.status, text: await response.text(), headers: response.headers };
        })),
      })) as Promise<{ status: number; text: string; headers: Headers }>;
    };

    const first = await send({ b: 2, a: 1 });
    const replay = await send({ a: 1, b: 2 });
    expect(first.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.text).toBe(first.text);
    expect(replay.headers.get('idempotency-replayed')).toBe('true');
    expect(generated.size).toBe(1);

    const key = [...generated][0]!;
    expect(key).toBe(GENERATED_KEY);
    const mismatch = await send({ a: 1, b: 3 }, key);
    expect(mismatch.status).toBe(409);
    expect(handler).toHaveBeenCalledTimes(1);

    const admin = await postgres!.connectAsAdmin();
    try {
      const events = await admin.query<{ count: string }>(
        "select count(*) from audit.events where tenancy_id = $1 and operation = 'command.ngidem'", [TENANT]);
      expect(Number(events.rows[0]?.count)).toBe(1);
      const keys = await admin.query<{ key: string; count: string }>(
        'select key, count(*)::text as count from core.idempotency_keys where tenant_id = $1 group by key', [TENANT]);
      expect(keys.rows).toHaveLength(1);
      expect(keys.rows[0]?.count).toBe('1');
      expect(keys.rows[0]?.key.endsWith(`:${key}`)).toBe(true);
    } finally {
      await admin.end();
    }
    const requestId = mismatch.headers.get('x-request-id');
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
    const error = JSON.parse(mismatch.text) as Record<string, unknown>;
    expect(error).toEqual({ statusCode: 409, errorCode: 'IDEMPOTENCY:CONFLICT:duplicate-key',
      message: 'Idempotency key was used for a different request', requestId, details: { key }, retryable: false });
  });
});
