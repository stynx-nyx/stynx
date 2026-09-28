import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Controller, HttpException, Logger, Post, UseGuards, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditSqlSink } from '@stynx-nyx/audit';
import {
  type AuditEventEnvelope,
  type AuditTransactionExecutor,
  type TransactionalAuditSink,
} from '@stynx-nyx/contracts';
import { StynxCoreModule } from '@stynx-nyx/core';
import { Database, StynxDataModule } from '@stynx-nyx/data';
import {
  Idempotent,
  StynxIdempotencyModule,
  TransactionalIdempotencyStore,
} from '@stynx-nyx/idempotency';
import request from 'supertest';
import { z } from 'zod';
import { Audit, StynxTransactionalCommandModule, TransactionalCommand } from '../../src/index';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { StynxAuthModule } from '../../src/auth/auth.module';
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
} from '../../../data/test/support/postgres';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9d1';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2832a';
const asAppRole = (connectionString: string): string =>
  `${connectionString}&options=${encodeURIComponent('-c role=stynx_app')}`;
const asReaderRole = (connectionString: string): string =>
  `${connectionString}&options=${encodeURIComponent('-c role=stynx_reader')}`;

function expectInProgressEnvelope(response: { status: number; body: unknown; headers: Record<string, string | undefined> }, key: string): void {
  expect(response.status).toBe(409);
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  expect(response.body).toEqual({ statusCode: 409, errorCode: 'IDEMPOTENCY:CONFLICT:in-progress',
    message: 'Idempotency key is in progress', requestId, details: { key }, retryable: true });
}

function expectDependencyEnvelope(response: { status: number; body: unknown; headers: Record<string, string | undefined> }): void {
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ statusCode: 503, errorCode: 'COMMAND:DEPENDENCY:transaction-failed',
    message: 'Transactional command failed', requestId, retryable: false });
}

const tick = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

class FaultingCompletionStore extends TransactionalIdempotencyStore {
  override async lookup(...args: Parameters<TransactionalIdempotencyStore['lookup']>) {
    const result = await super.lookup(...args);
    if (args[1].key === 'lookup-fault') throw new Error('injected lookup failure');
    return result;
  }

  override async reserve(...args: Parameters<TransactionalIdempotencyStore['reserve']>) {
    const result = await super.reserve(...args);
    if (args[1].key === 'reserve-fault') throw new Error('injected reserve failure');
    return result;
  }

  override async complete(
    ...args: Parameters<TransactionalIdempotencyStore['complete']>
  ): Promise<void> {
    await super.complete(...args);
    if (args[1].key === 'completion-fault')
      throw new Error('injected completion failure after durable update');
  }

  override async clear(...args: Parameters<TransactionalIdempotencyStore['clear']>): Promise<void> {
    await super.clear(...args);
    if (args[1].key === 'clear-fault') throw new Error('injected clear failure');
  }
}

describe('transactional command rollback and concurrency over app-role PostgreSQL', () => {
  let postgres: PostgresTestDatabase | undefined;
  let app: INestApplication | undefined;
  const invocations = new Map<string, number>();
  let releaseRace: (() => void) | undefined;
  let raceEntered: (() => void) | undefined;
  let raceEnteredPromise: Promise<void>;
  let releaseCommitRace: (() => void) | undefined;
  let commitRaceEntered: (() => void) | undefined;
  let releaseRollbackRace: (() => void) | undefined;
  let rollbackRaceEntered: (() => void) | undefined;
  let auditEntered: (() => void) | undefined;
  let auditEnteredPromise: Promise<void>;
  const cacheSet = vi.fn(async () => undefined);

  const countInvocations = (mode: string): number => invocations.get(mode) ?? 0;

  beforeAll(async () => {
    @Controller('/transactional-faults')
    @UseGuards(AuthContextGuard)
    class FaultController {
      constructor(private readonly database: Database) {}

      private async record(mode: string): Promise<void> {
        invocations.set(mode, countInvocations(mode) + 1);
        await this.database.tx(
          async (trx) => {
            const identity = await trx.query<{
              current_user: string;
              role: string;
              tenant: string;
              actor: string;
            }>(
              "select current_user, current_setting('app.role', true) as role, current_setting('app.tenant_id', true) as tenant, current_setting('app.actor_id', true) as actor",
            );
            expect(identity.rows[0]).toEqual({
              current_user: 'stynx_app',
              role: 'app',
              tenant: TENANT,
              actor: ACTOR,
            });
            await trx.query(
              'insert into core.transactional_fault_probe (tenant_id, key, mode) values ($1, $2, $3)',
              [TENANT, randomUUID(), mode],
            );
          },
          { role: 'app', requireActor: true },
        );
      }

      @Post('/handler')
      async handlerFault() {
        await this.record('handler');
        throw new HttpException({ code: 'HANDLER_FAILED' }, 502);
      }

      @Post('/audit')
      async auditFault() {
        await this.record('audit');
        return { saved: true };
      }

      @Post('/completion')
      async completionFault() {
        await this.record('completion');
        return { saved: true };
      }

      @Post('/lookup')
      async lookupFault() { await this.record('lookup'); return { saved: true }; }

      @Post('/reserve')
      async reserveFault() { await this.record('reserve'); return { saved: true }; }

      @Post('/clear')
      async clearFault() { await this.record('clear'); return { saved: true }; }

      @Post('/commit')
      async commitFault() {
        await this.record('commit');
        return { saved: true };
      }

      @Post('/serialization')
      async serializationFault() {
        await this.record('serialization');
        await this.database.tx(
          async (trx) => {
            await trx.query(
              "do $$ begin raise exception 'injected serialization failure' using errcode = '40001'; end $$",
            );
          },
          { role: 'app', requireActor: true },
        );
        return { mustNotCommit: true };
      }

      @Post('/statement-timeout')
      async statementTimeout() {
        await this.record('statement-timeout');
        await this.database.tx(
          async (trx) => {
            await trx.query("select set_config('statement_timeout', '80ms', true)");
            await trx.query('select pg_sleep(0.3)');
          },
          { role: 'app', requireActor: true },
        );
        return { mustNotCommit: true };
      }

      @Post('/race')
      async race() {
        await this.record('race');
        raceEntered?.();
        await new Promise<void>((resolve) => {
          releaseRace = resolve;
        });
        return { winner: true };
      }

      @Post('/race-commit')
      async raceCommit() {
        await this.record('race-commit');
        commitRaceEntered?.();
        await new Promise<void>((resolve) => {
          releaseCommitRace = resolve;
        });
        return { winner: true, payload: 'ação' };
      }

      @Post('/race-rollback')
      async raceRollback() {
        await this.record('race-rollback');
        if (countInvocations('race-rollback') === 1) {
          rollbackRaceEntered?.();
          await new Promise<void>((resolve) => {
            releaseRollbackRace = resolve;
          });
          throw new HttpException({ code: 'WINNER_ROLLED_BACK' }, 502);
        }
        return { acquired: true };
      }

      @Post('/audit-contention')
      async auditContention() {
        await this.record('audit-contention');
        auditEntered?.();
        return { committed: true };
      }

      @Post('/legacy')
      legacy() {
        invocations.set('legacy', countInvocations('legacy') + 1);
        return { ordinary: true };
      }
    }

    const commandMethods = [
      'handlerFault',
      'auditFault',
      'completionFault',
      'lookupFault',
      'reserveFault',
      'clearFault',
      'commitFault',
      'serializationFault',
      'statementTimeout',
      'race',
      'raceCommit',
      'raceRollback',
      'auditContention',
    ] as const;
    for (const method of commandMethods) {
      const descriptor = Object.getOwnPropertyDescriptor(FaultController.prototype, method)!;
      TransactionalCommand({
        ...(method === 'clearFault' ? { persistStatus: () => false } : {}),
        lockTimeoutMs:
          method === 'race' || method === 'auditContention'
            ? 120
            : method === 'raceCommit' || method === 'raceRollback'
              ? 1_500
              : 5_000,
      })(FaultController.prototype, method, descriptor);
      Idempotent({ transactional: true })(FaultController.prototype, method, descriptor);
      Audit({ action: `command.${method}`, entity: 'command', transactional: true })(
        FaultController.prototype,
        method,
        descriptor,
      );
    }

    postgres = await createPostgresTestDatabase('stynx_transactional_faults');
    const sqlSink = new AuditSqlSink(
      {
        query: async () => {
          throw new Error('legacy audit executor used');
        },
      },
      { mode: 'audit_write_function' },
    );
    const auditSink: TransactionalAuditSink = {
      async writeInTransaction(
        event: AuditEventEnvelope,
        executor: AuditTransactionExecutor,
      ): Promise<void> {
        await sqlSink.writeInTransaction(event, executor);
        if (event.action === 'command.auditFault')
          throw new Error('injected audit failure after write');
      },
    };
    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'transactional-faults', schema: z.object({}) }),
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('ctg5-fault-owner') },
            app: { connectionString: asAppRole(postgres.connectionString('ctg5-fault-app')) },
            reader: {
              connectionString: asReaderRole(postgres.connectionString('ctg5-fault-reader')),
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
            set: cacheSet,
            acquireLock: async () => true,
            releaseLock: async () => undefined,
            isLocked: async () => false,
          },
        }),
        StynxTransactionalCommandModule.forRoot({ auditSink }),
      ],
      controllers: [FaultController],
    })
      .overrideProvider(TransactionalIdempotencyStore)
      .useClass(FaultingCompletionStore)
      .compile();
    app = testing.createNestApplication();
    await app.init();

    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(
        `insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values ($1, 'transactional-faults', 'Transactional faults', true, clock_timestamp(), clock_timestamp())`,
        [TENANT],
      );
      await admin.query(`
        create table core.transactional_fault_probe (
          tenant_id uuid not null,
          key text not null,
          mode text not null,
          primary key (tenant_id, key)
        );
        alter table core.transactional_fault_probe enable row level security;
        alter table core.transactional_fault_probe force row level security;
        create policy transactional_fault_probe_tenant on core.transactional_fault_probe
          using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
          with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
        grant select, insert on core.transactional_fault_probe to stynx_app;
        create function core.transactional_fault_commit_guard() returns trigger language plpgsql as $$
        begin
          if new.mode = 'commit' then
            raise exception 'injected deferred commit failure' using errcode = 'P0001';
          end if;
          return new;
        end $$;
        create constraint trigger transactional_fault_commit_guard
          after insert on core.transactional_fault_probe
          deferrable initially deferred for each row
          execute function core.transactional_fault_commit_guard();
      `);
    } finally {
      await admin.end();
    }
  }, 90_000);

  afterAll(async () => {
    releaseRace?.();
    releaseCommitRace?.();
    releaseRollbackRace?.();
    await app?.close();
    await postgres?.dispose();
  }, 60_000);

  const send = (path: string, key: string) =>
    request(app!.getHttpServer())
      .post(`/transactional-faults/${path}`)
      .set('authorization', 'Bearer verified')
      .set('idempotency-key', key)
      .send({ input: key });

  const waitForBlockedReservation = async (): Promise<void> => {
    const admin = await postgres!.connectAsAdmin();
    try {
      const deadline = Date.now() + 1_000;
      while (Date.now() < deadline) {
        const result = await admin.query<{ blocked: string }>(`
          select count(*) as blocked from pg_stat_activity
           where datname = current_database()
             and application_name = 'ctg5-fault-app'
             and wait_event_type = 'Lock'
             and query ilike '%insert into core.idempotency_keys%'
        `);
        if (Number(result.rows[0]?.blocked) > 0) return;
        await tick(10);
      }
      throw new Error('Contender did not reach the durable reservation lock');
    } finally {
      await admin.end();
    }
  };

  const assertNoDurableEffect = async (
    mode: string,
    key: string,
    auditOperation = `command.${mode}Fault`,
  ): Promise<void> => {
    const admin = await postgres!.connectAsAdmin();
    try {
      const domain = await admin.query<{ count: string }>(
        'select count(*) from core.transactional_fault_probe where tenant_id = $1 and mode = $2',
        [TENANT, mode],
      );
      const audit = await admin.query<{ count: string }>(
        'select count(*) from audit.events where tenancy_id = $1 and operation = $2',
        [TENANT, auditOperation],
      );
      const keys = await admin.query<{ count: string }>(
        'select count(*) from core.idempotency_keys where tenant_id = $1 and key like $2',
        [TENANT, `%:${key.length}:${key}`],
      );
      expect(Number(domain.rows[0]?.count)).toBe(0);
      expect(Number(audit.rows[0]?.count)).toBe(0);
      expect(Number(keys.rows[0]?.count)).toBe(0);
    } finally {
      await admin.end();
    }
  };

  it.each([
    ['handler', 'handler-fault'],
    ['audit', 'audit-fault'],
    ['completion', 'completion-fault'],
    ['commit', 'commit-fault'],
  ])(
    'rolls back domain, audit and key after %s failure, then permits a new attempt',
    async (mode, key) => {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const result = await send(mode, key);
        if (mode === 'handler') {
          expect(result.status).toBe(502);
          expect(result.body).toEqual({ code: 'HANDLER_FAILED' });
        } else {
          expectDependencyEnvelope(result);
        }
        expect(countInvocations(mode)).toBe(attempt);
        await assertNoDurableEffect(mode, key);
      }
    },
    30_000,
  );

  it('logs the original audit failure stack and request ID without exposing it in the 503 envelope', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const response = await send('audit', 'audit-observability');
      expectDependencyEnvelope(response);
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining(`requestId=${response.headers['x-request-id']}`),
        expect.stringContaining('injected audit failure after write'),
      );
      expect(response.text).not.toContain('injected audit failure after write');
      await assertNoDurableEffect('audit', 'audit-observability');
    } finally { errorLog.mockRestore(); }
  });

  it('surfaces serialization failure after one handler invocation with no committed effects', async () => {
    const response = await send('serialization', 'serialization-fault');
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ code: 'SERIALIZATION_FAILURE',
      message: 'Transaction failed after retrying serialization errors',
      context: { attempts: 1, code: '40001' } });
    expect(countInvocations('serialization')).toBe(1);
    await assertNoDurableEffect('serialization', 'serialization-fault');
  });

  it.each([
    ['lookup', 'lookup-fault', 0], ['reserve', 'reserve-fault', 0], ['clear', 'clear-fault', 1],
  ] as const)('maps %s store failure to the exact nonretryable 503 after rollback', async (mode, key, calls) => {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await send(mode, key);
      expectDependencyEnvelope(result);
      expect(countInvocations(mode)).toBe(calls * attempt);
      await assertNoDurableEffect(mode, key);
    }
  });

  it('maps app-pool connection failure before BEGIN to 503 without invoking the handler', async () => {
    const handler = vi.fn(() => ({ mustNotCommit: true }));
    @Controller('/transactional-setup-fault')
    @UseGuards(AuthContextGuard)
    class SetupFaultController {
      @Post()
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.setupFault', transactional: true })
      command() { return handler(); }
    }
    const unavailable = `postgresql://localhost:1/${postgres!.database}`;
    const auditSink = new AuditSqlSink({ query: async () => { throw new Error('legacy audit path used'); } },
      { mode: 'audit_write_function' });
    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'transactional-setup-fault', schema: z.object({}) }),
        StynxDataModule.forRoot({ connections: {
          owner: { connectionString: postgres!.connectionString('ctg5-setup-owner') },
          app: { connectionString: unavailable },
          reader: { connectionString: asReaderRole(postgres!.connectionString('ctg5-setup-reader')) },
        }, migrations: { enabled: false } }),
        StynxAuthModule.forRoot({ tokenVerifier: { verifyAuthorizationHeader: async () => ({ principal: {
          id: ACTOR, roles: ['member'], permissions: [], tenants: [TENANT], claims: { tenant_id: TENANT },
        } }) } }),
        StynxIdempotencyModule.forRoot({ backend: { get: async () => null, set: async () => undefined,
          acquireLock: async () => true, releaseLock: async () => undefined, isLocked: async () => false } }),
        StynxTransactionalCommandModule.forRoot({ auditSink }),
      ], controllers: [SetupFaultController],
    }).compile();
    const setupApp = testing.createNestApplication();
    try {
      await setupApp.init();
      const response = await request(setupApp.getHttpServer()).post('/transactional-setup-fault')
        .set('authorization', 'Bearer verified').set('idempotency-key', 'setup-fault').send({ value: 1 });
      expectDependencyEnvelope(response);
      expect(handler).not.toHaveBeenCalled();
      await assertNoDurableEffect('setup', 'setup-fault');
    } finally { await setupApp.close(); }
  });

  it('rolls back a real PostgreSQL statement timeout without publishing cache or consuming the key', async () => {
    const cachePublicationsBefore = cacheSet.mock.calls.length;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await send('statement-timeout', 'statement-timeout-key');
      expect(response.status).toBe(504);
      expect(response.body).toEqual({ code: 'STATEMENT_TIMEOUT',
        message: 'Transaction exceeded the configured statement timeout', context: { originalCode: '57014' } });
      expect(countInvocations('statement-timeout')).toBe(attempt);
      await assertNoDurableEffect(
        'statement-timeout',
        'statement-timeout-key',
        'command.statementTimeout',
      );
      expect(cacheSet.mock.calls.length).toBe(cachePublicationsBefore);
    }
  }, 30_000);

  it('bounds an identical-key reservation race and never invokes the losing handler', async () => {
    raceEnteredPromise = new Promise<void>((resolve) => {
      raceEntered = resolve;
    });
    const winner = send('race', 'race-key').then((response) => response);
    await raceEnteredPromise;
    try {
      const startedAt = Date.now();
      const [firstLoser, secondLoser] = await Promise.all([
        send('race', 'race-key'),
        send('race', 'race-key'),
      ]);
      expectInProgressEnvelope(firstLoser, 'race-key');
      expectInProgressEnvelope(secondLoser, 'race-key');
      expect(firstLoser.headers['x-request-id']).not.toBe(secondLoser.headers['x-request-id']);
      expect(Date.now() - startedAt).toBeLessThan(3_000);
      expect(countInvocations('race')).toBe(1);
    } finally {
      releaseRace?.();
    }
    const committed = await winner;
    expect(committed.status).toBe(201);
    const replay = await send('race', 'race-key');
    expect(replay.status).toBe(201);
    expect(replay.text).toBe(committed.text);
    expect(countInvocations('race')).toBe(1);
  }, 30_000);

  it('replays byte-identical committed output when the winner commits during the bounded wait', async () => {
    const entered = new Promise<void>((resolve) => {
      commitRaceEntered = resolve;
    });
    const winner = send('race-commit', 'race-commit-key').then((response) => response);
    await entered;
    const contender = send('race-commit', 'race-commit-key').then((response) => response);
    try {
      await waitForBlockedReservation();
    } finally {
      releaseCommitRace?.();
    }
    const committed = await winner;
    const replay = await contender;
    expect(committed.status).toBe(201);
    expect(replay.status).toBe(201);
    expect(replay.text).toBe(committed.text);
    expect(replay.headers['content-type']).toBe(committed.headers['content-type']);
    expect(replay.headers['idempotency-replayed']).toBe('true');
    expect(countInvocations('race-commit')).toBe(1);
  }, 30_000);

  it('lets the contender acquire the same key after the waiting winner rolls back', async () => {
    const entered = new Promise<void>((resolve) => {
      rollbackRaceEntered = resolve;
    });
    const winner = send('race-rollback', 'race-rollback-key').then((response) => response);
    await entered;
    const contender = send('race-rollback', 'race-rollback-key').then((response) => response);
    try {
      await waitForBlockedReservation();
    } finally {
      releaseRollbackRace?.();
    }
    const failed = await winner;
    const acquired = await contender;
    expect(failed.status).toBe(502);
    expect(acquired.status).toBe(201);
    expect(acquired.body).toEqual({ acquired: true });
    expect(Object.hasOwn(acquired.headers, 'idempotency-replayed')).toBe(false);
    expect(countInvocations('race-rollback')).toBe(2);
    const replay = await send('race-rollback', 'race-rollback-key');
    expect(replay.status).toBe(201);
    expect(replay.text).toBe(acquired.text);
    expect(countInvocations('race-rollback')).toBe(2);
    const admin = await postgres!.connectAsAdmin();
    try {
      const audit = await admin.query<{ count: string }>(
        "select count(*) from audit.events where tenancy_id = $1 and operation = 'command.raceRollback'",
        [TENANT],
      );
      expect(Number(audit.rows[0]?.count)).toBe(1);
    } finally {
      await admin.end();
    }
  }, 30_000);

  it('does not label audit hash-chain contention beyond lockTimeoutMs as an idempotency race', async () => {
    const admin = await postgres!.connectAsAdmin();
    auditEnteredPromise = new Promise<void>((resolve) => {
      auditEntered = resolve;
    });
    await admin.query('begin');
    await admin.query('select pg_advisory_xact_lock(hashtextextended($1::text, 0))', [TENANT]);
    let responsePromise: Promise<{ status: number; body: unknown; text: string }> | undefined;
    try {
      const startedAt = Date.now();
      responsePromise = send('audit-contention', 'audit-contention-key').then(
        (response) => response,
      );
      await Promise.race([
        auditEnteredPromise,
        responsePromise.then((response) => {
          throw new Error(`Command returned before the audit handler: ${JSON.stringify(response.body)}`);
        }),
      ]);
      await tick(260);
      await admin.query('commit');
      const response = await responsePromise;
      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(120);
      expect(response.status).toBe(201);
      expect(response.body).toEqual({ committed: true });
      expect(countInvocations('audit-contention')).toBe(1);
    } finally {
      await admin.query('rollback').catch(() => undefined);
      await admin.end();
      await responsePromise?.catch(() => undefined);
    }
  }, 30_000);

  it('preserves ordinary unmarked route behavior beside the global command boundary', async () => {
    const first = await send('legacy', 'legacy-key');
    const second = await send('legacy', 'legacy-key');
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body).toEqual({ ordinary: true });
    expect(second.body).toEqual({ ordinary: true });
    expect(countInvocations('legacy')).toBe(2);
  });
});
