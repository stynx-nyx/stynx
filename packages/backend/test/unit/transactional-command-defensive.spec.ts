import 'reflect-metadata';
import { HttpException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { STYNX_PUBLIC_TENANT_ROUTE, STYNX_VERIFIED_TENANT_ID } from '@stynx-nyx/contracts';
import { STYNX_IDEMPOTENT_ROUTE } from '@stynx-nyx/idempotency';
import { firstValueFrom, of } from 'rxjs';
import { STYNX_AUDIT_METADATA } from '../../src/audit/constants';
import { STYNX_TRANSACTIONAL_COMMAND, TransactionalCommandInterceptor } from '../../src/transactional-command/transactional-command';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';

function fixture(options: { marked?: boolean; lockTimeoutMs?: number; ttlMs?: number;
  hasContext?: boolean; actorId?: string; type?: string } = {}) {
  const request = { method: 'POST', url: '/defensive', headers: { 'idempotency-key': 'unit-key' },
    principal: { id: ACTOR } };
  Reflect.set(request, STYNX_VERIFIED_TENANT_ID, TENANT);
  const reflector = { getAllAndOverride: (key: unknown) => {
    if (key === STYNX_TRANSACTIONAL_COMMAND) return { ...(options.lockTimeoutMs === undefined ? {} : { lockTimeoutMs: options.lockTimeoutMs }) };
    if (key === STYNX_IDEMPOTENT_ROUTE) return options.marked === false ? undefined
      : { transactional: true, ...(options.ttlMs === undefined ? {} : { ttlMs: options.ttlMs }) };
    if (key === STYNX_AUDIT_METADATA) return { transactional: true, action: 'unit.defensive' };
    if (key === STYNX_PUBLIC_TENANT_ROUTE) return undefined;
    return undefined;
  } };
  const database = { tx: vi.fn(async () => { throw new Error('database must not run'); }) };
  const requestContext = { hasActiveContext: () => options.hasContext !== false,
    snapshot: () => ({ tenantId: TENANT, actorId: options.actorId ?? ACTOR,
      requestId: '0197481e-7294-7c53-8b03-5c36d7c2831a' }) };
  const interceptor = new TransactionalCommandInterceptor(reflector as never, database as never,
    requestContext as never, {} as never, {} as never, {} as never,
    { auditSink: { writeInTransaction: vi.fn() } } as never);
  const context = { getType: () => options.type ?? 'http', getHandler: () => fixture,
    getClass: () => Object, switchToHttp: () => ({ getRequest: () => request,
      getResponse: () => ({ statusCode: 201, getHeaders: () => ({}) }) }) } as unknown as ExecutionContext;
  const next = { handle: () => of({ never: 'called' }) } as CallHandler;
  return { interceptor, context, next, database };
}

describe('transactional command defensive runtime checks before SQL', () => {
  it('refuses execution outside HTTP before opening a transaction', () => {
    const { interceptor, context, next, database } = fixture({ type: 'rpc' });
    expect(() => interceptor.intercept(context, next)).toThrow('Transactional commands require HTTP execution');
    expect(database.tx).not.toHaveBeenCalled();
  });

  it.each([
    [{ marked: false }, 500, 'COMMAND:CONFIGURATION:marking-required'],
    [{ hasContext: false }, 403, 'COMMAND:FORBIDDEN:context-missing'],
    [{ actorId: '' }, 403, 'COMMAND:FORBIDDEN:actor-or-tenant-missing'],
    [{ lockTimeoutMs: 0 }, 500, 'COMMAND:CONFIGURATION:lock-timeout-invalid'],
    [{ ttlMs: 0 }, 500, 'COMMAND:CONFIGURATION:ttl-invalid'],
  ] as const)('rejects a defensive invalid configuration %j without SQL', async (options, status, errorCode) => {
    const { interceptor, context, next, database } = fixture(options);
    try {
      await firstValueFrom(interceptor.intercept(context, next));
      throw new Error('expected defensive rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const rejection = error as HttpException;
      expect(rejection.getStatus()).toBe(status);
      expect((rejection as HttpException & { errorCode?: string }).errorCode).toBe(errorCode);
    }
    expect(database.tx).not.toHaveBeenCalled();
  });
});
