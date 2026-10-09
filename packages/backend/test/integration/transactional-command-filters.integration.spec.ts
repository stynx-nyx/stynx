import 'reflect-metadata';
import {
  Catch,
  Controller,
  Post,
  UseFilters,
  UseGuards,
  type ArgumentsHost,
  type ExceptionFilter,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { StynxCoreModule } from '@stynx-nyx/core';
import { StynxDataModule } from '@stynx-nyx/data';
import { Idempotent, StynxIdempotencyModule } from '@stynx-nyx/idempotency';
import request from 'supertest';
import { z } from 'zod';
import {
  Audit,
  CommittedCommandError,
  StynxTransactionalCommandModule,
  TransactionalCommand,
} from '../../src/index';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9d2';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2832b';
const COMMITTED_BODY = { code: 'DELEGATION_FAILED', message: 'Ação indisponível' };
const asRole = (connectionString: string, role: 'stynx_app' | 'stynx_reader'): string =>
  `${connectionString}&options=${encodeURIComponent(`-c role=${role}`)}`;

@Catch()
class ConsumerCatchAll implements ExceptionFilter {
  catch(_error: unknown, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<{ status(status: number): { json(body: unknown): void } }>()
      .status(599)
      .json({ code: 'CONSUMER_FILTER_WON' });
  }
}

@Catch(Error)
class ConsumerCatchError implements ExceptionFilter {
  catch(_error: unknown, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<{ status(status: number): { json(body: unknown): void } }>()
      .status(598)
      .json({ code: 'CONSUMER_ERROR_FILTER_WON' });
  }
}

describe('transactional command method filter precedence over real Nest HTTP and PostgreSQL', () => {
  let postgres: PostgresTestDatabase | undefined;

  const modules = () => [
    StynxCoreModule.forRoot({ appName: 'transactional-filters', schema: z.object({}) }),
    StynxDataModule.forRoot({
      connections: {
        owner: { connectionString: postgres!.connectionString('ctg5-filter-owner') },
        app: {
          connectionString: postgres!.appConnectionString('ctg5-filter-app'),
        },
        reader: {
          connectionString: asRole(
            postgres!.connectionString('ctg5-filter-reader'),
            'stynx_reader',
          ),
        },
      },
      migrations: { enabled: true },
    }),
  ];

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_transactional_filters');
    const setup = await Test.createTestingModule({ imports: modules() }).compile();
    const setupApp = setup.createNestApplication();
    try {
      await setupApp.init();
      const admin = await postgres.connectAsAdmin();
      try {
        await admin.query(
          `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
          values ($1, 'transactional-filters', 'Transactional filters', true, clock_timestamp(), clock_timestamp())`,
          [TENANT],
        );
      } finally {
        await admin.end();
      }
    } finally {
      await setupApp.close();
    }
  }, 90_000);

  afterAll(async () => {
    await postgres?.dispose();
  }, 60_000);

  const createApp = async (
    filter: new () => ExceptionFilter,
    consumerFirst: boolean,
  ): Promise<{
    app: INestApplication;
    handler: ReturnType<typeof vi.fn>;
  }> => {
    const handler = vi.fn();
    @Controller('/transactional-filters')
    @UseGuards(AuthContextGuard)
    class FilterController {
      @Post('/command')
      command() {
        handler();
        throw new CommittedCommandError(502, COMMITTED_BODY);
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(FilterController.prototype, 'command')!;
    if (consumerFirst) {
      // Nest reverses method filter metadata for selection. The consumer then wins.
      TransactionalCommand()(FilterController.prototype, 'command', descriptor);
      UseFilters(filter)(FilterController.prototype, 'command', descriptor);
    } else {
      UseFilters(filter)(FilterController.prototype, 'command', descriptor);
      TransactionalCommand()(FilterController.prototype, 'command', descriptor);
    }
    Idempotent({ transactional: true })(FilterController.prototype, 'command', descriptor);
    Audit({ action: 'command.filterPrecedence', entity: 'command', transactional: true })(
      FilterController.prototype,
      'command',
      descriptor,
    );

    const auditSink = new AuditSqlSink(
      {
        query: async () => {
          throw new Error('legacy audit executor must not run');
        },
      },
      { mode: 'audit_write_function' },
    );
    const testing = await Test.createTestingModule({
      imports: [
        ...modules(),
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
        StynxTransactionalCommandModule.forRoot({ auditSink }),
      ],
      controllers: [FilterController],
    }).compile();
    return { app: testing.createNestApplication(), handler };
  };

  it.each([
    ['catch-all', ConsumerCatchAll],
    ['Error', ConsumerCatchError],
  ])(
    'rejects a method-level @Catch(%s) filter that would run before STYNX',
    async (_name, filter) => {
      const { app, handler } = await createApp(filter, true);
      try {
        let bootstrapError: unknown;
        try {
          await app.init();
        } catch (error) {
          bootstrapError = error;
        }
        expect(bootstrapError).toBeInstanceOf(Error);
        expect((bootstrapError as Error).message).toMatch(
          /filter that would intercept committed responses/u,
        );
        expect(handler).not.toHaveBeenCalled();
      } finally {
        await app.close();
      }
    },
    30_000,
  );

  it.each([
    ['catch-all', ConsumerCatchAll],
    ['Error', ConsumerCatchError],
  ])(
    'allows the other @Catch(%s) order and preserves committed 502 and replay bytes',
    async (name, filter) => {
      const { app, handler } = await createApp(filter, false);
      try {
        await app.init();
        const send = () =>
          request(app.getHttpServer())
            .post('/transactional-filters/command')
            .set('authorization', 'Bearer verified')
            .set('idempotency-key', `method-filter-${name}`)
            .send({ value: 'ação' });
        const committed = await send();
        const replay = await send();
        expect(committed.status).toBe(502);
        expect(replay.status).toBe(502);
        expect(committed.text).toBe(JSON.stringify(COMMITTED_BODY));
        expect(replay.text).toBe(committed.text);
        expect(replay.headers['content-type']).toBe('application/json; charset=utf-8');
        expect(replay.headers['idempotency-replayed']).toBe('true');
        expect(handler).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    },
    30_000,
  );

  it('rejects an inherited transactional route without a built-in STYNX auth guard at bootstrap', async () => {
    class BaseCommandController {
      @Post('/inherited')
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.inherited', entity: 'command', transactional: true })
      inherited() {
        return { mustNotRun: true };
      }
    }

    @Controller('/transactional-filters')
    class InheritedCommandController extends BaseCommandController {}

    const auditSink = new AuditSqlSink(
      {
        query: async () => {
          throw new Error('legacy audit executor must not run');
        },
      },
      { mode: 'audit_write_function' },
    );
    const testing = await Test.createTestingModule({
      imports: [
        ...modules(),
        StynxIdempotencyModule.forRoot({
          backend: {
            get: async () => null,
            set: async () => undefined,
            acquireLock: async () => true,
            releaseLock: async () => undefined,
            isLocked: async () => false,
          },
        }),
        StynxTransactionalCommandModule.forRoot({ auditSink }),
      ],
      controllers: [InheritedCommandController],
    }).compile();
    const app = testing.createNestApplication();
    try {
      let bootstrapError: unknown;
      try {
        await app.init();
      } catch (error) {
        bootstrapError = error;
      }
      expect(bootstrapError).toBeInstanceOf(Error);
      expect((bootstrapError as Error).message).toMatch(/requires a built-in STYNX auth guard/u);
    } finally {
      await app.close();
    }
  }, 30_000);
});
