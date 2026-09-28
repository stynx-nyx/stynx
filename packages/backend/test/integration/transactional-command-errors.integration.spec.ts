import 'reflect-metadata';
import { Controller, HttpCode, HttpException, Logger, Post, UseGuards, type CanActivate, type ExecutionContext,
  type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditSqlSink } from '@stynx-nyx/audit';
import { StynxCoreModule } from '@stynx-nyx/core';
import { StynxDataModule } from '@stynx-nyx/data';
import { Idempotent, StynxIdempotencyModule } from '@stynx-nyx/idempotency';
import request from 'supertest';
import { z } from 'zod';
import { Audit, StynxAuthModule, StynxTransactionalCommandModule, TransactionalCommand } from '../../src/index';
import { AuthContextGuard } from '../../src/auth/auth-context.guard';
import { PatternAuditMetadataRedactionPolicy } from '../../src/audit/redaction-policy';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../../../data/test/support/postgres';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';

const asRole = (connectionString: string, role: 'stynx_app' | 'stynx_reader'): string =>
  `${connectionString}&options=${encodeURIComponent(`-c role=${role}`)}`;

function expectEnvelope(response: { status: number; body: unknown; headers: Record<string, string | undefined> },
  errorCode = 'COMMAND:CONFIGURATION:scope-callback-failed', message = 'Command scope evaluation failed',
  statusCode = 500): void {
  expect(response.status).toBe(statusCode);
  const requestId = response.headers['x-request-id'];
  expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  expect(response.body).toEqual({
    statusCode,
    errorCode,
    message,
    requestId,
    retryable: false,
  });
}

describe('transactional command canonical configuration rejections over Nest HTTP', () => {
  let app: INestApplication;
  let postgres: PostgresTestDatabase;
  const handler = vi.fn(() => ({ mustNotRun: true }));

  beforeAll(async () => {
    class InvalidBodyGuard implements CanActivate {
      canActivate(context: ExecutionContext): boolean {
        context.switchToHttp().getRequest<{ body: unknown }>().body = BigInt(1);
        return true;
      }
    }
    postgres = await createPostgresTestDatabase('stynx_transactional_command_errors');
    @Controller('/transactional-command-errors')
    @UseGuards(AuthContextGuard)
    class ErrorController {
      @Post('/scope-callback')
      @TransactionalCommand({ scope: () => { throw new Error('scope callback failure'); } })
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.scope-callback', transactional: true })
      scopeCallback() { return handler(); }

      @Post('/persist-status-invalid')
      @TransactionalCommand({ persistStatus: () => undefined as unknown as boolean })
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.persist-status-invalid', transactional: true })
      persistStatusInvalid() { return handler('persist-status-invalid'); }

      @Post('/persist-status-throws')
      @TransactionalCommand({ persistStatus: () => { throw new Error('policy failure'); } })
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.persist-status-throws', transactional: true })
      persistStatusThrows() { return handler('persist-status-throws'); }

      @Post('/persist-status-http-exception')
      @TransactionalCommand({ persistStatus: () => { throw new HttpException({ code: 'POLICY_THROWN' }, 418); } })
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.persist-status-http-exception', transactional: true })
      persistStatusHttpException() { return handler('persist-status-http-exception'); }

      @Post('/status-invalid')
      @HttpCode(700)
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.status-invalid', transactional: true })
      statusInvalid() { return handler('status-invalid'); }

      @Post('/key-required')
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.key-required', transactional: true })
      keyRequired() { return handler('key-required'); }

      @Post('/body-invalid')
      @UseGuards(InvalidBodyGuard)
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.body-invalid', transactional: true })
      bodyInvalid() { return handler('body-invalid'); }

      @Post('/response-not-json')
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.response-not-json', transactional: true })
      responseNotJson() { handler('response-not-json'); return BigInt(1); }

      @Post('/audit-metadata')
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.audit-metadata', transactional: true,
        metadataSelector: () => { throw new Error('metadata failure'); } })
      auditMetadata() { return handler('audit-metadata'); }

      @Post('/audit-entity-id')
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.audit-entity-id', transactional: true,
        entityIdSelector: () => { throw new Error('entity ID failure'); } })
      auditEntityId() { return handler('audit-entity-id'); }

      @Post('/audit-redaction')
      @TransactionalCommand()
      @Idempotent({ transactional: true })
      @Audit({ action: 'command.errors.audit-redaction', transactional: true,
        metadataSelector: () => ({ safe: 'metadata' }) })
      auditRedaction() { return handler('audit-redaction'); }
    }
    const auditSink = new AuditSqlSink({ query: async () => { throw new Error('legacy audit executor reached'); } },
      { mode: 'audit_write_function' });
    const testing = await Test.createTestingModule({
      imports: [
        StynxCoreModule.forRoot({ appName: 'transactional-command-errors', schema: z.object({}) }),
        StynxDataModule.forRoot({ connections: {
          owner: { connectionString: postgres.connectionString('command-errors-owner') },
          app: { connectionString: asRole(postgres.connectionString('command-errors-app'), 'stynx_app') },
          reader: { connectionString: asRole(postgres.connectionString('command-errors-reader'), 'stynx_reader') },
        }, migrations: { enabled: true } }),
        StynxAuthModule.forRoot({ tokenVerifier: { verifyAuthorizationHeader: async () => ({ principal: {
          id: ACTOR, roles: ['member'], permissions: [], tenants: [TENANT], claims: { tenant_id: TENANT },
        } }) } }),
        StynxIdempotencyModule.forRoot({ backend: {
          get: async () => null, set: async () => undefined, acquireLock: async () => true,
          releaseLock: async () => undefined, isLocked: async () => false,
        } }),
        StynxTransactionalCommandModule.forRoot({ auditSink }),
      ],
      controllers: [ErrorController],
    }).compile();
    app = testing.createNestApplication();
    await app.init();
    const admin = await postgres.connectAsAdmin();
    try {
      await admin.query(`insert into tenancy.tenants (id, slug, name, is_active, created_at, updated_at)
        values ($1, 'command-errors', 'Command errors', true, clock_timestamp(), clock_timestamp())`, [TENANT]);
    } finally { await admin.end(); }
  });

  afterAll(async () => { await app?.close(); await postgres?.dispose(); });

  async function assertNoDurableEffect(): Promise<void> {
    const admin = await postgres.connectAsAdmin();
    try {
      const keys = await admin.query<{ count: string }>('select count(*)::text as count from core.idempotency_keys where tenant_id = $1', [TENANT]);
      const audits = await admin.query<{ count: string }>('select count(*)::text as count from audit.events where tenancy_id = $1', [TENANT]);
      expect(keys.rows[0]?.count).toBe('0');
      expect(audits.rows[0]?.count).toBe('0');
    } finally { await admin.end(); }
  }

  it('maps a thrown scope callback to its exact canonical envelope before handler, audit, reservation or domain work', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const response = await request(app.getHttpServer()).post('/transactional-command-errors/scope-callback')
        .set('authorization', 'Bearer verified').set('idempotency-key', 'scope-callback-key').send({ value: 1 });
      expectEnvelope(response);
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining(`requestId=${response.headers['x-request-id']}`),
        expect.stringContaining('scope callback failure'),
      );
      expect(response.text).not.toContain('scope callback failure');
      expect(handler).not.toHaveBeenCalled();
      await assertNoDurableEffect();
    } finally { errorLog.mockRestore(); }
  });

  it('logs the original in-transaction callback stack while keeping the 500 envelope fixed', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const response = await request(app.getHttpServer()).post('/transactional-command-errors/persist-status-throws')
        .set('authorization', 'Bearer verified').set('idempotency-key', 'policy-observability').send({ value: 1 });
      expectEnvelope(response, 'COMMAND:CONFIGURATION:status-policy-invalid', 'Command status policy failed');
      expect(errorLog).toHaveBeenCalledWith(
        expect.stringContaining(`requestId=${response.headers['x-request-id']}`),
        expect.stringContaining('policy failure'),
      );
      expect(response.text).not.toContain('policy failure');
      await assertNoDurableEffect();
    } finally { errorLog.mockRestore(); }
  });

  it.each([
    ['/persist-status-invalid', 'COMMAND:CONFIGURATION:status-policy-invalid', 'Command status policy failed'],
    ['/persist-status-throws', 'COMMAND:CONFIGURATION:status-policy-invalid', 'Command status policy failed'],
    ['/persist-status-http-exception', 'COMMAND:CONFIGURATION:status-policy-invalid', 'Command status policy failed'],
    ['/status-invalid', 'COMMAND:CONFIGURATION:status-invalid', 'Command response status is invalid'],
    ['/response-not-json', 'COMMAND:CONFIGURATION:response-not-json', 'Command response is not valid JSON'],
    ['/audit-metadata', 'COMMAND:CONFIGURATION:audit-metadata-failed', 'Command audit metadata failed'],
    ['/audit-entity-id', 'COMMAND:CONFIGURATION:audit-metadata-failed', 'Command audit metadata failed'],
  ] as const)('maps %s to its exact canonical rollback envelope with no durable key or audit', async (path, code, message) => {
    const response = await request(app.getHttpServer()).post(`/transactional-command-errors${path}`)
      .set('authorization', 'Bearer verified').set('idempotency-key', `errors${path}`).send({ value: 1 });
    expectEnvelope(response, code, message);
    await assertNoDurableEffect();
  });

  it('rejects a missing idempotency key without invoking the handler or persisting a key or audit row', async () => {
    const before = handler.mock.calls.length;
    const response = await request(app.getHttpServer()).post('/transactional-command-errors/key-required')
      .set('authorization', 'Bearer verified').send({ value: 1 });
    expectEnvelope(response, 'IDEMPOTENCY:BAD_REQUEST:key-required', 'Idempotency key is required', 400);
    expect(handler.mock.calls.length).toBe(before);
    await assertNoDurableEffect();
  });

  it('rejects a non-JSON command body before entering a transaction', async () => {
    const before = handler.mock.calls.length;
    const response = await request(app.getHttpServer()).post('/transactional-command-errors/body-invalid')
      .set('authorization', 'Bearer verified').set('idempotency-key', 'invalid-body').send({ value: 1 });
    expectEnvelope(response, 'COMMAND:BAD_REQUEST:body-invalid', 'Command body is invalid', 400);
    expect(handler.mock.calls.length).toBe(before);
    await assertNoDurableEffect();
  });

  it('maps a throwing audit redaction policy to the same canonical rollback envelope', async () => {
    const spy = vi.spyOn(PatternAuditMetadataRedactionPolicy.prototype, 'redact')
      .mockImplementation(() => { throw new Error('redaction failure'); });
    try {
      const response = await request(app.getHttpServer()).post('/transactional-command-errors/audit-redaction')
        .set('authorization', 'Bearer verified').set('idempotency-key', 'redaction-failure').send({ value: 1 });
      expectEnvelope(response, 'COMMAND:CONFIGURATION:audit-metadata-failed', 'Command audit metadata failed');
      await assertNoDurableEffect();
    } finally { spy.mockRestore(); }
  });
});
