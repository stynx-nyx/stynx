import 'reflect-metadata';
import { lastValueFrom, of } from 'rxjs';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { IfMatchExceptionFilter, IfMatchPreconditionInterceptor, PreconditionFailedError, PreconditionRequiredError, RevisionETagInterceptor } from '../../src/if-match/if-match';
import { EXCEPTION_FILTERS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import * as backend from '../../src/index';

type IfMatchError = Error & { getStatus(): number };
type IfMatchApi = {
  parseIfMatchRevision: (value: string | undefined) => number;
  RequireIfMatch: () => MethodDecorator;
  IfMatchRevision: () => ParameterDecorator;
  RevisionETag: () => MethodDecorator;
  IfMatchExceptionFilter: new (...args: never[]) => unknown;
  PreconditionRequiredError: new (message?: string, details?: Record<string, unknown>) => IfMatchError;
  PreconditionFailedError: new (message?: string, details?: Record<string, unknown>) => IfMatchError;
};

const api = backend as unknown as Partial<IfMatchApi>;

describe('published If-Match contract', () => {
  it('exports the parser, route and parameter decorators, ETag decorator, two errors and scoped filter', () => {
    for (const name of [
      'parseIfMatchRevision', 'RequireIfMatch', 'IfMatchRevision', 'RevisionETag',
      'PreconditionRequiredError', 'PreconditionFailedError', 'IfMatchExceptionFilter',
    ] as const) expect(api[name], name).toBeTypeOf('function');
  });

  it.each([
    ['"0"', 0], ['"1"', 1], ['"42"', 42], [`"${Number.MAX_SAFE_INTEGER}"`, Number.MAX_SAFE_INTEGER],
  ])('parses exactly one strong integer tag %s', (raw, revision) => {
    expect(api.parseIfMatchRevision).toBeTypeOf('function');
    expect(api.parseIfMatchRevision!(raw)).toBe(revision);
  });

  it('distinguishes truly absent from present but empty headers', () => {
    expect(api.parseIfMatchRevision).toBeTypeOf('function');
    expect(api.PreconditionRequiredError).toBeTypeOf('function');
    expect(() => api.parseIfMatchRevision!(undefined)).toThrow(api.PreconditionRequiredError);
    try { api.parseIfMatchRevision!(undefined); }
    catch (error) { expect((error as IfMatchError).getStatus()).toBe(428); }
    expect(() => api.parseIfMatchRevision!('')).toThrow(api.PreconditionFailedError);
  });

  it.each([
    '', ' ', '\t', '7', '"-1"', '"01"', '"1.0"', '"+1"', '"NaN"',
    'W/"1"', '*', '"1","2"', '"1", "2"', ' "1"', '"1" ',
    '"9007199254740992"', '"999999999999999999999999999999"',
  ])('rejects present malformed/unsafe tag %j with 412', (raw) => {
    expect(api.parseIfMatchRevision).toBeTypeOf('function');
    expect(api.PreconditionFailedError).toBeTypeOf('function');
    expect(() => api.parseIfMatchRevision!(raw)).toThrow(api.PreconditionFailedError);
    try { api.parseIfMatchRevision!(raw); }
    catch (error) { expect((error as IfMatchError).getStatus()).toBe(412); }
  });

  it('binds its own filter and interceptor at method scope', () => {
    expect(api.RequireIfMatch).toBeTypeOf('function');
    expect(api.IfMatchExceptionFilter).toBeTypeOf('function');
    class Resource { update(_revision: number): void {} }
    const descriptor = Object.getOwnPropertyDescriptor(Resource.prototype, 'update')!;
    api.IfMatchRevision!()(Resource.prototype, 'update', 0);
    api.RequireIfMatch!()(Resource.prototype, 'update', descriptor);
    const filters = Reflect.getMetadata(EXCEPTION_FILTERS_METADATA, Resource.prototype.update) as unknown[] | undefined;
    const interceptors = Reflect.getMetadata(INTERCEPTORS_METADATA, Resource.prototype.update) as unknown[] | undefined;
    expect(filters).toContain(api.IfMatchExceptionFilter);
    expect(interceptors?.length).toBeGreaterThan(0);
  });

  it('rejects non-string request headers, assigns valid revisions, and writes response ETags', async () => {
    const interceptor = new IfMatchPreconditionInterceptor();
    const malformed = { headers: { 'if-match': ['"3"'] } };
    const malformedContext = { switchToHttp: () => ({ getRequest: () => malformed }) } as never;
    expect(() => interceptor.intercept(malformedContext, { handle: () => of(null) })).toThrow(PreconditionFailedError);

    const request = { headers: { 'if-match': '"3"' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never;
    await expect(lastValueFrom(interceptor.intercept(context, { handle: () => of('updated') }))).resolves.toBe('updated');

    const response = { setHeader: vi.fn() };
    const eTagContext = { switchToHttp: () => ({ getResponse: () => response }) } as never;
    await expect(lastValueFrom(new RevisionETagInterceptor().intercept(eTagContext, { handle: () => of({ revision: 0 }) })))
      .resolves.toEqual({ revision: 0 });
    expect(response.setHeader).toHaveBeenCalledWith('ETag', '"0"');
    for (const body of [null, [], {}, { revision: -1 }, { revision: Number.MAX_SAFE_INTEGER + 1 }]) {
      await expect(lastValueFrom(new RevisionETagInterceptor().intercept(eTagContext, { handle: () => of(body) })))
        .rejects.toThrow(/safe nonnegative integer revision/i);
    }
  });

  it('serializes precondition failures with the supplied request ID and optional details', () => {
    const adapter = { getHeader: vi.fn(() => undefined), setHeader: vi.fn(), reply: vi.fn() };
    const filter = new IfMatchExceptionFilter({ httpAdapter: adapter } as never);
    const request = { headers: { 'x-request-id': '0197481e-7294-7c53-8b03-5c36d7c2831a' } };
    const response = {};
    const host = { switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }) } as never;

    filter.catch(new PreconditionRequiredError('Supply revision', { current: 2 }), host);

    expect(adapter.setHeader).toHaveBeenCalledWith(response, 'X-Request-Id', '0197481e-7294-7c53-8b03-5c36d7c2831a');
    expect(adapter.reply).toHaveBeenCalledWith(response, expect.objectContaining({
      statusCode: 428, errorCode: 'PRECONDITION:REQUIRED:if-match', requestId: '0197481e-7294-7c53-8b03-5c36d7c2831a', details: { current: 2 },
    }), 428);
  });

  it('generates a request ID when context, adapter, and request provide none', () => {
    const adapter = { getHeader: vi.fn(() => undefined), setHeader: vi.fn(), reply: vi.fn() };
    const filter = new IfMatchExceptionFilter({ httpAdapter: adapter } as never);
    const response = {};
    const host = { switchToHttp: () => ({ getRequest: () => ({ headers: {} }), getResponse: () => response }) } as never;

    filter.catch(new PreconditionFailedError(), host);

    const [[target, name, requestId]] = adapter.setHeader.mock.calls;
    expect(target).toBe(response);
    expect(name).toBe('X-Request-Id');
    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(adapter.reply).toHaveBeenCalledWith(response, expect.objectContaining({ requestId }), 412);
  });

  it('rejects parameter resolution when the route omitted RequireIfMatch', () => {
    class Resource { update(_revision: number): void {} }
    const decorator = api.IfMatchRevision!();
    decorator(Resource.prototype, 'update', 0);
    const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, Resource, 'update') as Record<
      string, { factory: (data: unknown, context: unknown) => number }
    >;
    const parameter = Object.values(args)[0]!;
    const context = { switchToHttp: () => ({ getRequest: () => ({}) }) };
    expect(() => parameter.factory(undefined, context)).toThrow(/requires RequireIfMatch/i);
  });
});
