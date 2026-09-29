import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { HttpException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EXCEPTION_FILTERS_METADATA, FILTER_CATCH_EXCEPTIONS, GUARDS_METADATA } from '@nestjs/common/constants';
import { HttpAdapterHost } from '@nestjs/core';
import { STYNX_BUILTIN_AUTH_GUARD, STYNX_PUBLIC_TENANT_ROUTE, STYNX_RESOLVED_TENANT_COMMAND_CONTEXT, STYNX_VERIFIED_TENANT_ID } from '@stynx-nyx/contracts';
import { STYNX_IDEMPOTENT_ROUTE, TransactionalReservationTimeoutError } from '@stynx-nyx/idempotency';
import { firstValueFrom, of, throwError } from 'rxjs';
import type { RequestLike } from '../../src/common/request-context';
import { STYNX_AUDIT_METADATA } from '../../src/audit/constants';
import {
  CommittedCommandError,
  CommittedCommandResponse,
  CommittedCommandResponseFilter,
  STYNX_TRANSACTIONAL_COMMAND,
  TransactionalCommandInterceptor,
} from '../../src/transactional-command/transactional-command';

const TENANT = '0197481e-6f84-77e4-8d6d-41f0b6fca9c1';
const ACTOR = '0197481e-7294-7c53-8b03-5c36d7c2831a';

function runtime(options: {
  request?: Partial<RequestLike>;
  route?: Record<string, unknown> | undefined;
  idempotency?: Record<string, unknown> | undefined;
  audit?: Record<string, unknown> | undefined;
  dropIdempotency?: boolean;
  module?: Record<string, unknown>;
  scope?: (context: Record<string, unknown>) => string;
  persistStatus?: (outcome: Record<string, unknown>) => boolean;
  lookup?: unknown;
  reserve?: boolean;
  handler?: () => ReturnType<typeof of>;
  responseStatus?: number;
  responseHeaders?: Record<string, unknown>;
  txError?: Error;
  unmarked?: boolean;
  omitResponseHeaders?: boolean;
} = {}) {
  const handler = () => undefined;
  const request: RequestLike = {
    method: 'POST', url: '/commands/a?ignored=1', headers: { 'idempotency-key': 'unit-key' },
    principal: { id: ACTOR, roles: ['admin'] }, body: { value: 1 },
    ...options.request,
  };
  Reflect.set(request, STYNX_VERIFIED_TENANT_ID, TENANT);
  const routeOptions = options.unmarked ? undefined : options.route ?? {};
  const idempotency = options.idempotency ?? { transactional: true, ttlMs: 60_000 };
  const audit = options.audit ?? { transactional: true, action: 'unit.command' };
  const reflector = {
    getAllAndOverride(key: unknown) {
      if (key === STYNX_TRANSACTIONAL_COMMAND) return routeOptions;
      if (key === STYNX_IDEMPOTENT_ROUTE) return idempotency;
      if (key === STYNX_AUDIT_METADATA) return audit;
      return undefined;
    },
  };
  const existing = options.lookup;
  const store = {
    lookup: vi.fn(async () => existing),
    reserve: vi.fn(async () => options.reserve ?? true),
    complete: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const transaction = async (callback: (trx: object) => Promise<unknown>) => {
    if (options.txError) throw options.txError;
    return callback({});
  };
  const database = { tx: vi.fn(transaction) };
  const events: unknown[] = [];
  const auditSink = { writeInTransaction: vi.fn(async (event: unknown) => { events.push(event); }) };
  const requestContext = {
    hasActiveContext: () => true,
    snapshot: () => ({ tenantId: TENANT, actorId: ACTOR, requestId: 'request-1' }),
  };
  const interceptor = new TransactionalCommandInterceptor(reflector as never, database as never,
    requestContext as never, store as never, {} as never, {} as never,
    { auditSink, ...(options.scope ? { scope: options.scope } : {}),
      ...(options.persistStatus ? { persistStatus: options.persistStatus } : {}) } as never);
  const context = {
    getType: () => 'http', getHandler: () => handler, getClass: () => ({ name: 'UnitController' }),
    switchToHttp: () => ({ getRequest: () => request,
      getResponse: () => ({ statusCode: options.responseStatus ?? 201,
        ...(options.omitResponseHeaders ? {} : { getHeaders: () => options.responseHeaders ?? {} }) }) }),
  } as unknown as ExecutionContext;
  const next = { handle: options.handler ?? (() => of({ id: 'record-1' })) } as CallHandler;
  return { interceptor, context, next, request, database, store, auditSink, events };
}

describe('transactional command direct execution branches', () => {
  it('commits the default successful result with only allowed response headers', async () => {
    const state = runtime({ responseHeaders: { location: '/records/1', 'set-cookie': 'secret' } });
    await expect(firstValueFrom(state.interceptor.intercept(state.context, state.next))).rejects.toMatchObject({
      statusCode: 201, replay: false, key: 'unit-key', headers: { location: '/records/1' },
    });
    expect(state.auditSink.writeInTransaction).toHaveBeenCalledOnce();
    expect(state.store.complete).toHaveBeenCalledOnce();
    expect(state.store.clear).not.toHaveBeenCalled();
  });

  it('passes through unmarked handlers and requires the module marker for marked handlers', async () => {
    const unmarked = runtime({ unmarked: true });
    await expect(firstValueFrom(unmarked.interceptor.intercept(unmarked.context, unmarked.next)))
      .resolves.toEqual({ id: 'record-1' });
    expect(unmarked.database.tx).not.toHaveBeenCalled();

    const { CommandModuleRequiredInterceptor } = await import('../../src/transactional-command/transactional-command');
    const moduleCheck = new CommandModuleRequiredInterceptor();
    const request = {};
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    expect(() => moduleCheck.intercept(context, { handle: () => of(null) })).toThrow(HttpException);

    const marked = runtime();
    try { await firstValueFrom(marked.interceptor.intercept(marked.context, marked.next)); } catch { /* committed responses are thrown after commit */ }
    await expect(firstValueFrom(moduleCheck.intercept(marked.context, marked.next))).resolves.toEqual({ id: 'record-1' });
  });

  it('captures only string response headers and tolerates response adapters without getHeaders', async () => {
    const state = runtime({ responseHeaders: { etag: 7, 'cache-control': 'private' } });
    await expect(firstValueFrom(state.interceptor.intercept(state.context, state.next))).rejects.toMatchObject({
      headers: { 'cache-control': 'private' },
    });
    const withoutHeaders = runtime({ omitResponseHeaders: true });
    await expect(firstValueFrom(withoutHeaders.interceptor.intercept(withoutHeaders.context, withoutHeaders.next)))
      .rejects.toMatchObject({ headers: {} });
  });

  it('returns non-selected payloads and clears their idempotency reservation', async () => {
    const state = runtime({ persistStatus: () => false, responseStatus: 204 });
    await expect(firstValueFrom(state.interceptor.intercept(state.context, state.next))).resolves.toEqual({ id: 'record-1' });
    expect(state.store.clear).toHaveBeenCalledOnce();
    expect(state.store.complete).not.toHaveBeenCalled();
  });

  it('hashes framed JSON bodies canonically and rejects values that are not JSON', async () => {
    const canonical = runtime({ request: {
      headers: { 'idempotency-key': 'unit-key', 'content-length': '10' },
      body: { z: 1, a: 2 }, originalUrl: '/commands/%2f///?ignored=1',
    } });
    await expect(firstValueFrom(canonical.interceptor.intercept(canonical.context, canonical.next)))
      .rejects.toBeInstanceOf(CommittedCommandResponse);
    expect(canonical.store.lookup.mock.calls[0]?.[1].fingerprint)
      .toBe(requestFingerprint('POST', '/commands/%2F', 'json:{"a":2,"z":1}'));

    const prefixKeys = runtime({ request: {
      headers: { 'idempotency-key': 'unit-key', 'transfer-encoding': 'chunked' }, body: { aa: 2, a: 1 },
    } });
    await expect(firstValueFrom(prefixKeys.interceptor.intercept(prefixKeys.context, prefixKeys.next)))
      .rejects.toBeInstanceOf(CommittedCommandResponse);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const sparse = new Array(2);
    for (const body of [Number.NaN, 1n, () => undefined, cyclic, sparse, new Date()]) {
      const invalid = runtime({ request: {
        headers: { 'idempotency-key': 'unit-key', 'transfer-encoding': 'chunked' }, body,
      } });
      await expect(firstValueFrom(invalid.interceptor.intercept(invalid.context, invalid.next))).rejects.toMatchObject({
        statusCode: 400,
      });
      expect(invalid.database.tx).not.toHaveBeenCalled();
    }
    const dense = runtime({ request: {
      headers: { 'idempotency-key': 'unit-key', 'transfer-encoding': 'chunked' }, body: [1, 2],
    } });
    await expect(firstValueFrom(dense.interceptor.intercept(dense.context, dense.next)))
      .rejects.toBeInstanceOf(CommittedCommandResponse);
  });

  it('encodes empty and non-JSON response payloads according to wire semantics', async () => {
    const empty = runtime({ handler: () => of(undefined) });
    await expect(firstValueFrom(empty.interceptor.intercept(empty.context, empty.next))).rejects.toMatchObject({
      statusCode: 201, bytes: null,
    });

    const invalid = runtime({ handler: () => of(() => undefined) });
    await expect(firstValueFrom(invalid.interceptor.intercept(invalid.context, invalid.next))).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it('replays completed responses and rejects a replay fingerprint mismatch', async () => {
    const state = runtime({ lookup: { fingerprint: 'wrong', status: 'completed', statusCode: 200, bytes: Buffer.from('{}'), headers: {} } });
    await expect(firstValueFrom(state.interceptor.intercept(state.context, state.next))).rejects.toMatchObject({ statusCode: 409 });
    expect(state.store.reserve).not.toHaveBeenCalled();

    const replay = runtime({ lookup: {
      fingerprint: requestFingerprint('POST', '/commands/a', 'absent'), status: 'completed', statusCode: 200,
      bytes: Buffer.from('{"replayed":true}'), headers: { ETag: 'v1', 'set-cookie': 'secret' },
    } });
    await expect(firstValueFrom(replay.interceptor.intercept(replay.context, replay.next))).rejects.toMatchObject({
      statusCode: 200, replay: true, headers: { etag: 'v1' },
    });
  });

  it('commits a selected handler error and lets an unselected committed error pass through', async () => {
    const selected = runtime({ handler: () => throwError(() => new CommittedCommandError(502, { safe: true }, { 'retry-after': '2', authorization: 'secret' })) });
    await expect(firstValueFrom(selected.interceptor.intercept(selected.context, selected.next))).rejects.toMatchObject({
      statusCode: 502, headers: { 'retry-after': '2' },
    });

    const unselected = runtime({
      handler: () => throwError(() => new CommittedCommandError(422, { invalid: true })),
      persistStatus: () => false,
    });
    try {
      await firstValueFrom(unselected.interceptor.intercept(unselected.context, unselected.next));
      throw new Error('expected unselected committed response to be a normal HTTP exception');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(422);
    }
    expect(unselected.auditSink.writeInTransaction).not.toHaveBeenCalled();
  });

  it('maps reservation and dependency failures while preserving data errors', async () => {
    const conflict = runtime({ reserve: false });
    await expect(firstValueFrom(conflict.interceptor.intercept(conflict.context, conflict.next))).rejects.toMatchObject({ statusCode: 409 });

    const timeout = runtime({ txError: new TransactionalReservationTimeoutError() });
    await expect(firstValueFrom(timeout.interceptor.intercept(timeout.context, timeout.next))).rejects.toMatchObject({ statusCode: 409 });

    const failure = runtime({ txError: new Error('connection failed') });
    await expect(firstValueFrom(failure.interceptor.intercept(failure.context, failure.next))).rejects.toMatchObject({ statusCode: 503 });
  });

  it('writes the committed response, replay, and boundary rejection through the HTTP adapter', () => {
    const adapter = { getHeader: vi.fn(() => undefined), setHeader: vi.fn(), reply: vi.fn() };
    const filter = new CommittedCommandResponseFilter({ httpAdapter: adapter } as unknown as HttpAdapterHost);
    const response = {};
    const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ headers: {} }) }) } as never;

    filter.catch(new CommittedCommandResponse(200, Buffer.from('{"ok":true}'), { etag: 'x', vary: 'bad' }, true, 'k'), host);
    expect(adapter.reply).toHaveBeenCalledWith(response, '{"ok":true}', 200);
    expect(adapter.setHeader).toHaveBeenCalledWith(response, 'content-type', 'application/json; charset=utf-8');
    expect(adapter.setHeader).toHaveBeenCalledWith(response, 'idempotency-replayed', 'true');
    expect(adapter.setHeader).not.toHaveBeenCalledWith(response, 'vary', 'bad');

    adapter.setHeader.mockClear();
    filter.catch(new CommittedCommandResponse(204, null, {}, false, ''), host);
    expect(adapter.reply).toHaveBeenLastCalledWith(response, null, 204);
    expect(adapter.setHeader).not.toHaveBeenCalled();
  });

  it('keeps configuration rejection responses stable for Error, opaque, and absent causes', async () => {
    const adapter = { getHeader: vi.fn(() => undefined), setHeader: vi.fn(), reply: vi.fn() };
    const filter = new CommittedCommandResponseFilter({ httpAdapter: adapter } as unknown as HttpAdapterHost);
    const response = {};
    const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ headers: {} }) }) } as never;
    const scenarios = [
      runtime({ scope: () => { throw new Error('scope failed'); } }),
      runtime({ scope: () => { throw 'opaque cause'; } }),
      runtime({ route: { lockTimeoutMs: 0 } }),
    ];

    for (const state of scenarios) {
      let rejection: unknown;
      try { await firstValueFrom(state.interceptor.intercept(state.context, state.next)); }
      catch (error) { rejection = error; }
      expect(rejection).toBeInstanceOf(HttpException);
      filter.catch(rejection as never, host);
      expect(adapter.reply).toHaveBeenLastCalledWith(response, expect.any(String), 500);
    }

    const noStack = new Error('cause without stack');
    noStack.stack = undefined;
    const fallback = runtime({ scope: () => { throw noStack; } });
    let rejection: unknown;
    try { await firstValueFrom(fallback.interceptor.intercept(fallback.context, fallback.next)); }
    catch (error) { rejection = error; }
    filter.catch(rejection as never, host);
    expect(adapter.reply).toHaveBeenLastCalledWith(response, expect.any(String), 500);

    const opaque = runtime({ scope: () => { throw 'opaque stackless cause'; } });
    try { await firstValueFrom(opaque.interceptor.intercept(opaque.context, opaque.next)); }
    catch (error) {
      Object.defineProperty(error as object, 'stack', { value: undefined });
      filter.catch(error as never, host);
    }
    expect(adapter.reply).toHaveBeenLastCalledWith(response, expect.any(String), 500);
  });

  it('handles URL fallbacks, array idempotency headers, invalid deadlines, and in-progress replays', async () => {
    const rootPath = runtime({ request: { originalUrl: undefined, url: undefined, method: undefined } });
    await expect(firstValueFrom(rootPath.interceptor.intercept(rootPath.context, rootPath.next)))
      .rejects.toBeInstanceOf(CommittedCommandResponse);
    expect(rootPath.store.lookup.mock.calls[0]?.[1].fingerprint)
      .toBe(requestFingerprint('', '/', 'absent'));
    const emptyPath = runtime({ request: { originalUrl: '', url: '/fallback' } });
    await expect(firstValueFrom(emptyPath.interceptor.intercept(emptyPath.context, emptyPath.next)))
      .rejects.toBeInstanceOf(CommittedCommandResponse);
    expect(emptyPath.store.lookup.mock.calls[0]?.[1].fingerprint)
      .toBe(requestFingerprint('POST', '/', 'absent'));

    const arrayHeader = runtime({ request: { headers: { 'idempotency-key': ['array-key'] } } });
    await expect(firstValueFrom(arrayHeader.interceptor.intercept(arrayHeader.context, arrayHeader.next)))
      .rejects.toMatchObject({ key: 'array-key' });

    const invalidDeadline = runtime({ route: { deadlineMs: 0 } });
    await expect(firstValueFrom(invalidDeadline.interceptor.intercept(invalidDeadline.context, invalidDeadline.next)))
      .rejects.toMatchObject({ statusCode: 500 });

    const inProgress = runtime({ lookup: {
      fingerprint: requestFingerprint('POST', '/commands/a', 'absent'),
      status: 'pending', statusCode: null, bytes: null, headers: {},
    } });
    await expect(firstValueFrom(inProgress.interceptor.intercept(inProgress.context, inProgress.next)))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects mismatched trusted claims before opening a transaction', async () => {
    for (const stynxClaims of [{ sub: 'other', tenantId: TENANT }, { sub: ACTOR, tenantId: 'other' }]) {
      const state = runtime({ request: { stynxClaims } as never });
      await expect(firstValueFrom(state.interceptor.intercept(state.context, state.next)))
        .rejects.toMatchObject({ statusCode: 403 });
      expect(state.database.tx).not.toHaveBeenCalled();
    }
  });

  it('includes selected audit metadata and request correlation fields in its envelope', async () => {
    const state = runtime({
      request: { requestId: 'request-1', correlationId: 'correlation-1', ip: '127.0.0.1' },
      audit: { transactional: true, action: 'unit.command', entityIdSelector: () => 'entity-1',
        metadataSelector: () => ({ category: 'unit' }) },
    });
    await expect(firstValueFrom(state.interceptor.intercept(state.context, state.next)))
      .rejects.toBeInstanceOf(CommittedCommandResponse);
    expect(state.events[0]).toMatchObject({
      entityId: 'entity-1', metadata: { category: 'unit' }, requestId: 'request-1',
      correlationId: 'correlation-1', ipAddress: '127.0.0.1',
    });
  });
});

function bootstrapper(options: {
  auditSink?: { writeInTransaction?: () => Promise<void> };
  route?: Record<string, unknown> | undefined;
  idempotency?: Record<string, unknown> | undefined;
  audit?: Record<string, unknown> | undefined;
  publicTenant?: unknown;
  guard?: boolean;
  filter?: boolean;
  catchAll?: boolean;
  tenancy?: boolean;
  globalGuard?: boolean;
  controller?: boolean;
  accessor?: boolean;
  filterMetadata?: boolean;
  nonFunctionFilter?: boolean;
  unrelatedFilter?: boolean;
  committedCatcher?: boolean;
  guardInstance?: boolean;
  globalGuardInstance?: boolean;
  filterWithoutCatchMetadata?: boolean;
} = {}) {
  class Controller { run(): void {} }
  if (options.accessor) Object.defineProperty(Controller.prototype, 'computed', { get: () => true });
  class BuiltInGuard {}
  Object.defineProperty(BuiltInGuard, STYNX_BUILTIN_AUTH_GUARD, { value: true });
  class CatchAllFilter {}
  class UnrelatedFilter {}
  class CommittedCatcherFilter {}
  class FilterWithoutCatchMetadata {}
  Reflect.defineMetadata(FILTER_CATCH_EXCEPTIONS, [], CatchAllFilter);
  Reflect.defineMetadata(FILTER_CATCH_EXCEPTIONS, [TypeError], UnrelatedFilter);
  Reflect.defineMetadata(FILTER_CATCH_EXCEPTIONS, [CommittedCommandResponse], CommittedCatcherFilter);
  const method = Controller.prototype.run;
  if (options.guard !== false) Reflect.defineMetadata(GUARDS_METADATA,
    [options.guardInstance ? new BuiltInGuard() : BuiltInGuard], method);
  if (options.filterMetadata !== false) Reflect.defineMetadata(EXCEPTION_FILTERS_METADATA,
    [...(options.filter === false ? [] : [CommittedCommandResponseFilter]),
      ...(options.catchAll ? [CatchAllFilter] : []), ...(options.unrelatedFilter ? [UnrelatedFilter] : []),
      ...(options.committedCatcher ? [CommittedCatcherFilter] : []),
      ...(options.filterWithoutCatchMetadata ? [FilterWithoutCatchMetadata] : []),
      ...(options.nonFunctionFilter ? [Object.create(null)] : [])], method);

  const providers = new Map<unknown, unknown>([['unrelated-provider', {}]]);
  if (options.tenancy) providers.set(STYNX_RESOLVED_TENANT_COMMAND_CONTEXT, {});
  if (options.globalGuard) providers.set(`${APP_GUARD}:unit`, options.globalGuardInstance
    ? { instance: new BuiltInGuard() } : { metatype: BuiltInGuard });
  const controllers = new Map([['controller', options.controller === false ? {} : { metatype: Controller }]]);
  const modules = new Map([['unit', { providers, controllers }]]);
  const reflector = {
    getAllAndOverride(key: unknown, targets?: unknown[]) {
      const routeTarget = targets?.[0] === method;
      if (key === STYNX_TRANSACTIONAL_COMMAND) return routeTarget
        ? (options.route === undefined ? {} : options.route) : undefined;
      if (!routeTarget) return undefined;
      if (key === STYNX_IDEMPOTENT_ROUTE) return options.dropIdempotency ? undefined : options.idempotency === undefined
        ? { transactional: true, ttlMs: 1000 } : options.idempotency;
      if (key === STYNX_AUDIT_METADATA) return options.audit === undefined
        ? { transactional: true, action: 'unit.command' } : options.audit;
      if (key === STYNX_PUBLIC_TENANT_ROUTE) return options.publicTenant;
      return undefined;
    },
  };
  const interceptor = new TransactionalCommandInterceptor(reflector as never, {} as never, {} as never,
    {} as never, modules as never, { get: vi.fn(() => ({ get: vi.fn() })) } as never,
    { auditSink: options.auditSink ?? { writeInTransaction: vi.fn(async () => undefined) } } as never);
  return { interceptor };
}

describe('transactional command bootstrap validation', () => {
  it('validates transactional markings, route options, TTL, authentication, filter order, and tenancy wiring', () => {
    expect(() => bootstrapper({ auditSink: {} }).interceptor.onApplicationBootstrap())
      .toThrow(/same-transaction audit sink/i);
    expect(() => bootstrapper({ dropIdempotency: true, audit: { transactional: false } }).interceptor.onApplicationBootstrap())
      .toThrow(/requires transactional audit and idempotency/i);
    expect(() => bootstrapper({ route: { mismatchCode: 'bad' } }).interceptor.onApplicationBootstrap())
      .toThrow(/mismatchCode/i);
    expect(() => bootstrapper({ idempotency: { transactional: true, ttlMs: 0 } }).interceptor.onApplicationBootstrap())
      .toThrow(/positive safe integer ttlMs/i);
    expect(() => bootstrapper({ guard: false }).interceptor.onApplicationBootstrap())
      .toThrow(/built-in STYNX auth guard/i);
    expect(() => bootstrapper({ filter: false }).interceptor.onApplicationBootstrap())
      .toThrow(/committed response filter/i);
    expect(() => bootstrapper({ catchAll: true }).interceptor.onApplicationBootstrap())
      .toThrow(/intercept committed responses/i);
    expect(() => bootstrapper({ committedCatcher: true }).interceptor.onApplicationBootstrap())
      .toThrow(/intercept committed responses/i);
    expect(() => bootstrapper({ publicTenant: { optionalAuth: false } }).interceptor.onApplicationBootstrap())
      .toThrow(/requires STYNX tenancy port/i);

    expect(() => bootstrapper({ publicTenant: { optionalAuth: false }, tenancy: true }).interceptor.onApplicationBootstrap())
      .not.toThrow();
    expect(() => bootstrapper({ guard: false, globalGuard: true }).interceptor.onApplicationBootstrap()).not.toThrow();
    expect(() => bootstrapper({ guardInstance: true }).interceptor.onApplicationBootstrap()).not.toThrow();
    expect(() => bootstrapper({ guard: false, globalGuard: true, globalGuardInstance: true }).interceptor.onApplicationBootstrap()).not.toThrow();
  });

  it('skips missing controller metatypes, accessors, and routes without filter metadata', () => {
    expect(() => bootstrapper({ controller: false }).interceptor.onApplicationBootstrap()).not.toThrow();
    expect(() => bootstrapper({ accessor: true }).interceptor.onApplicationBootstrap()).not.toThrow();
    expect(() => bootstrapper({ filterMetadata: false }).interceptor.onApplicationBootstrap())
      .toThrow(/committed response filter/i);
    expect(() => bootstrapper({ unrelatedFilter: true }).interceptor.onApplicationBootstrap()).not.toThrow();
    expect(() => bootstrapper({ nonFunctionFilter: true }).interceptor.onApplicationBootstrap()).not.toThrow();
    expect(() => bootstrapper({ filterWithoutCatchMetadata: true }).interceptor.onApplicationBootstrap())
      .toThrow(/intercept committed responses/i);
  });
});

function requestFingerprint(method: string, path: string, body: string): string {
  const hash = createHash('sha256');
  for (const part of [method, path, body]) {
    const bytes = Buffer.from(part, 'utf8');
    const size = Buffer.alloc(4);
    size.writeUInt32BE(bytes.length);
    hash.update(size).update(bytes);
  }
  return hash.digest('hex');
}
