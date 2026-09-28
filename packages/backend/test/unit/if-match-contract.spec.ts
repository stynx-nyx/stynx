import 'reflect-metadata';
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
});
