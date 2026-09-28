import 'reflect-metadata';
import {
  Catch,
  Controller,
  HttpCode,
  HttpException,
  Post,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { StynxCoreModule } from '@stynx-nyx/core';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { Idempotent, StynxIdempotencyModule } from '@stynx-nyx/idempotency';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';
import { map } from 'rxjs';
import request from 'supertest';
import { z } from 'zod';
import * as backend from '../../src/index';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';
const ERROR_BODY = { code: 'DELEGATION_FAILED', message: 'Upstream unavailable' };
// The test helper connects as the local admin; request pools must start as
// actual application/reader roles to exercise the command identity check.
const asRole = (connectionString: string, role: 'stynx_app' | 'stynx_reader'): string =>
  `${connectionString}&options=${encodeURIComponent(`-c role=${role}`)}`;

type CommandApi = {
  TransactionalCommand: (options?: Record<string, unknown>) => MethodDecorator;
  StynxTransactionalCommandModule: { forRoot(options: Record<string, unknown>): unknown };
  CommittedCommandError: new (status: number, body: unknown) => Error;
};

@Catch()
class ConsumerCatchAll implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host
      .switchToHttp()
      .getResponse<{ status(code: number): { json(body: unknown): void } }>();
    if (error instanceof HttpException && error.getStatus() !== 502) {
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    response.status(599).json({ code: 'CONSUMER_FILTER_WON' });
  }
}

class OuterMapper implements NestInterceptor {
  static successes = 0;

  intercept(_context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((value: unknown) => {
        OuterMapper.successes += 1;
        return { consumerMapped: true, value };
      }),
    );
  }
}

describe('transactional command committed wire response over Nest HTTP and PostgreSQL', () => {
  let postgres: PostgresTestDatabase | undefined;
  let app: INestApplication | undefined;
  const handler = vi.fn();

  beforeAll(async () => {
    const api = backend as unknown as Partial<CommandApi>;
    expect(api.TransactionalCommand).toBeTypeOf('function');
    expect(api.StynxTransactionalCommandModule?.forRoot).toBeTypeOf('function');
    expect(api.CommittedCommandError).toBeTypeOf('function');

    @Controller('/transactional-wire')
    @UseGuards(AuthContextGuard)
    class CommandController {
      constructor(private readonly database: Database) {}

      @Post('/delegation')
      async delegation() {
        handler();
        await this.database.tx(async (trx) => {
          const result = await trx.query<{
            current_user: string;
            role: string;
            tenant: string;
            actor: string;
          }>(
            "select current_user, current_setting('app.role', true) as role, current_setting('app.tenant_id', true) as tenant, current_setting('app.actor_id', true) as actor",
          );
          expect(result.rows[0]).toMatchObject({
            current_user: 'stynx_app',
            role: 'app',
            tenant: TENANT,
            actor: ACTOR,
          });
        });
        throw new api.CommittedCommandError!(502, ERROR_BODY);
      }

      @Post('/plain-error')
      plainError() {
        handler();
        throw new HttpException(ERROR_BODY, 502);
      }

      @Post('/unselected')
      unselected() {
        handler();
        throw new api.CommittedCommandError!(422, { code: 'VALIDATION:BAD_REQUEST:command' });
      }

      @Post('/unselected-success')
      @HttpCode(202)
      unselectedSuccess() {
        handler();
        return { accepted: true };
      }

      @Post('/delegation/:id')
      delegationById() {
        handler();
        throw new api.CommittedCommandError!(502, ERROR_BODY);
      }
    }

    for (const method of [
      'delegation',
      'plainError',
      'unselected',
      'unselectedSuccess',
      'delegationById',
    ] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(CommandController.prototype, method)!;
      api.TransactionalCommand!(
        method === 'unselected' || method === 'unselectedSuccess'
          ? { persistStatus: () => false }
          : {},
      )(CommandController.prototype, method, descriptor);
      (Idempotent as unknown as (options: { transactional: true }) => MethodDecorator)({
        transactional: true,
      })(CommandController.prototype, method, descriptor);
      backend.Audit({
        action: `command.${method}`,
        entity: 'command',
        transactional: true,
      } as never)(CommandController.prototype, method, descriptor);
    }

    postgres = await createPostgresTestDatabase('stynx_transactional_wire');
    const legacyExecutor = {
      query: vi.fn(async () => {
        throw new Error('legacy audit executor must not be used');
      }),
    };
    const auditSink = new AuditSqlSink(legacyExecutor, { mode: 'audit_write_function' });
    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'transactional-wire', schema: z.object({}) }),
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg5-wire-owner') },
            app: {
              connectionString: asRole(postgres.connectionString('ctg5-wire-app'), 'stynx_app'),
            },
            reader: {
              connectionString: asRole(
                postgres.connectionString('ctg5-wire-reader'),
                'stynx_reader',
              ),
            },
          },
          migrations: { enabled: true },
        }),
        StynxAuthModule.forRoot({
          tokenVerifier: {
            verifyAuthorizationHeader: async () => ({
              principal: {
                id: ACTOR,
                roles: ['member'],
                permissions: [],
                tenants: [TENANT],
                claims: { tenant_id: TENANT },
              },
            }),
          },
        }),
        StynxIdempotencyModule.forRoot({
          backend: {
            get: async () => null,
            set: async () => undefined,
            acquireLock: async () => true,
            releaseLock: async () => undefined,
            isLocked: async () => false,
          },
        }),
        api.StynxTransactionalCommandModule!.forRoot({ auditSink }) as never,
      ],
      controllers: [CommandController],
    }).compile();
    app = testing.createNestApplication();
    app.useGlobalFilters(new ConsumerCatchAll());
    app.useGlobalInterceptors(new OuterMapper());
    await app.init();
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values ($1, 'transactional-wire', 'Transactional wire', true, clock_timestamp(), clock_timestamp())`,
        [TENANT],
      );
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    await app?.close();
    await postgres?.dispose();
  });

  it('emits and replays committed 502, UTF-8 JSON and allowed headers despite default POST 201 and consumer wrappers', async () => {
    OuterMapper.successes = 0;
    const send = () =>
      request(app!.getHttpServer())
        .post('/transactional-wire/delegation')
        .set('authorization', 'Bearer verified')
        .set('idempotency-key', 'wire-502')
        .send({ name: 'ação' });
    const first = await send();
    const replay = await send();
    expect(first.status).toBe(502);
    expect(replay.status).toBe(502);
    expect(first.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(replay.headers['content-type']).toBe(first.headers['content-type']);
    expect(first.text).toBe(JSON.stringify(ERROR_BODY));
    expect(replay.text).toBe(first.text);
    expect(
      Object.entries(replay.headers).some(
        ([name, value]) => /replay/iu.test(name) && value === 'true',
      ),
    ).toBe(true);
    expect(Object.hasOwn(replay.headers, 'set-cookie')).toBe(false);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(OuterMapper.successes).toBe(0);
    const admin = await postgres!.connectAsAdmin();
    try {
      const events = await admin.query<{ count: string }>(
        "select count(*) from audit.events where tenancy_id = $1 and operation = 'command.delegation'",
        [TENANT],
      );
      expect(Number(events.rows[0]?.count)).toBe(1);
      const keys = await admin.query<{ count: string }>(
        'select count(*) from core.idempotency_keys where tenant_id = $1',
        [TENANT],
      );
      expect(Number(keys.rows[0]?.count)).toBe(1);
    } finally {
      await admin.end();
    }
  });

  it('rolls back a plain thrown 502 and lets the ordinary error path handle it', async () => {
    const send = () =>
      request(app!.getHttpServer())
        .post('/transactional-wire/plain-error')
        .set('authorization', 'Bearer verified')
        .set('idempotency-key', 'plain-502')
        .send({ name: 'ação' });
    const first = await send();
    const second = await send();
    expect(first.status).toBe(599);
    expect(second.status).toBe(599);
    expect(first.body).toEqual({ code: 'CONSUMER_FILTER_WON' });
    expect(handler).toHaveBeenCalledTimes(3);
    const admin = await postgres!.connectAsAdmin();
    try {
      const events = await admin.query<{ count: string }>(
        "select count(*) from audit.events where tenancy_id = $1 and operation = 'command.plainError'",
        [TENANT],
      );
      expect(Number(events.rows[0]?.count)).toBe(0);
      const keys = await admin.query<{ count: string }>(
        'select count(*) from core.idempotency_keys where tenant_id = $1',
        [TENANT],
      );
      expect(Number(keys.rows[0]?.count)).toBe(1);
    } finally {
      await admin.end();
    }
  });

  it('rolls back an unselected status without retaining a key or audit event', async () => {
    const response = await request(app!.getHttpServer())
      .post('/transactional-wire/unselected')
      .set('authorization', 'Bearer verified')
      .set('idempotency-key', 'unselected-422')
      .send({ name: 'invalid' });
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ code: 'VALIDATION:BAD_REQUEST:command' });
    const admin = await postgres!.connectAsAdmin();
    try {
      const events = await admin.query<{ count: string }>(
        "select count(*) from audit.events where tenancy_id = $1 and operation = 'command.unselected'",
        [TENANT],
      );
      expect(Number(events.rows[0]?.count)).toBe(0);
      const keys = await admin.query<{ count: string }>(
        "select count(*) from core.idempotency_keys where tenant_id = $1 and key like '%unselected-422%'",
        [TENANT],
      );
      expect(Number(keys.rows[0]?.count)).toBe(0);
    } finally {
      await admin.end();
    }
  });

  it('commits an unselected successful response and audit while clearing its key', async () => {
    const response = await request(app!.getHttpServer())
      .post('/transactional-wire/unselected-success')
      .set('authorization', 'Bearer verified')
      .set('idempotency-key', 'unselected-success')
      .send({ accepted: true });
    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ consumerMapped: true, value: { accepted: true } });
    const admin = await postgres!.connectAsAdmin();
    try {
      const events = await admin.query<{ count: string }>(
        "select count(*) from audit.events where tenancy_id = $1 and operation = 'command.unselectedSuccess'",
        [TENANT],
      );
      expect(Number(events.rows[0]?.count)).toBe(1);
      const keys = await admin.query<{ count: string }>(
        "select count(*) from core.idempotency_keys where tenant_id = $1 and key like '%unselected-success%'",
        [TENANT],
      );
      expect(Number(keys.rows[0]?.count)).toBe(0);
    } finally {
      await admin.end();
    }
  });

  it('returns the configured conflict envelope for the same tenant, scope and key on different concrete paths', async () => {
    const before = handler.mock.calls.length;
    const send = (id: string) =>
      request(app!.getHttpServer())
        .post(`/transactional-wire/delegation/${id}`)
        .set('authorization', 'Bearer verified')
        .set('idempotency-key', 'same-route-template')
        .send({ amount: 1 });
    await send('one').expect(502);
    const conflict = await send('two');
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({
      code: 'IDEMPOTENCY_KEY_CONFLICT',
      context: { key: 'same-route-template' },
    });
    expect(handler).toHaveBeenCalledTimes(before + 1);
  });
});
