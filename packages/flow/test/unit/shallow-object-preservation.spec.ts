import { BadRequestException } from '@nestjs/common';
import { FlowDesignService } from '../../src/flow-design.service.js';
import { FlowFormsService } from '../../src/flow-forms.service.js';
import {
  FlowDesignTableStore,
  graphPublishMeta,
  jsonObject,
  withGraphPublishState,
} from '../../src/internal/design/design-table-store.js';
import { asJsonObject } from '../../src/internal/runtime/runtime-filters.js';
import { requireObject } from '../../src/row-utils.js';

// S10 shallow-proof preservation: imported production functions, not copied guards.
const guards = [
  { name: 'design request body', guard: FlowDesignService.prototype['objectInput'] },
  { name: 'forms request body', guard: FlowFormsService.prototype['objectInput'] },
  { name: 'runtime required body', guard: requireObject },
  { name: 'design optional object', guard: jsonObject },
  { name: 'runtime optional object', guard: asJsonObject },
];
const FORM = '0190abcd-1234-7abc-89ab-000000000001';
const GRAPH = '0190abcd-1234-7abc-89ab-000000000002';

afterEach(() => vi.restoreAllMocks());

describe('shallow Flow objects retain their existing opaque boundary', () => {
  it.each(guards)('$name returns Dates, classes and opaque object identities without traversal', ({ guard }) => {
    class Opaque {
      readonly nested = { bigint: 1n, absent: undefined, date: new Date(0) };
    }
    const date = new Date(0);
    const instance = new Opaque();
    const nullPrototype = Object.assign(Object.create(null), { value: undefined });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    for (const value of [date, instance, nullPrototype, cyclic, new Map(), new Set(), /opaque/]) {
      expect(guard(value)).toBe(value);
    }
    expect(guard(instance).nested).toBe(instance.nested);
  });

  it.each(guards)('$name never reads own or inherited properties while guarding', ({ guard }) => {
    const read = vi.fn(() => { throw new Error('must not read properties'); });
    const prototype = Object.defineProperty({}, 'inherited', { get: read });
    const body = Object.defineProperty(Object.create(prototype), 'own', { enumerable: true, get: read });
    expect(guard(body)).toBe(body);
    expect(read).not.toHaveBeenCalled();
  });

  it.each(guards.slice(0, 3))('$name rejects non-objects with the exact existing error', ({ guard }) => {
    for (const value of [null, undefined, [], 'body', 0, false, 1n, Symbol('body'), () => ({})]) {
      expect(() => guard(value)).toThrow(BadRequestException);
      expect(() => guard(value)).toThrow('Request body must be an object');
      try { guard(value); } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (!(error instanceof BadRequestException)) throw error;
        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({
          message: 'Request body must be an object', error: 'Bad Request', statusCode: 400,
        });
      }
    }
  });

  it.each(guards.slice(3))('$name gives each invalid input a fresh ordinary empty object', ({ guard }) => {
    for (const value of [null, undefined, [], 'body', 0, false, 1n, Symbol('body'), () => ({})]) {
      const first = guard(value);
      expect(first).toEqual({});
      expect(Object.getPrototypeOf(first)).toBe(Object.prototype);
      expect(Reflect.ownKeys(first)).toEqual([]);
      expect(first).not.toBe(guard(value));
    }
  });

  it('forms public body entrypoint preserves inherited getter receiver, order and original body identity', async () => {
    const service = new FlowFormsService({} as never, {} as never);
    const calls: string[] = [];
    class Body {
      get formId() {
        expect(this).toBe(body);
        calls.push('formId');
        return FORM;
      }
    }
    const body = new Body();
    const create = vi.spyOn(service, 'createFill').mockImplementation(async (id, original) => {
      calls.push('createFill');
      expect(id).toBe(FORM);
      expect(original).toBe(body);
      return { id };
    });
    expect(await service.createFillFromBody(body)).toEqual({ id: FORM });
    expect(calls).toEqual(['formId', 'createFill']);
    expect(create).toHaveBeenCalledOnce();
  });

  it('design public body entrypoint accepts a Date and reads only own enumerable spread getters in order', async () => {
    const service = new FlowDesignService({} as never, {} as never);
    const calls: string[] = [];
    const body = new Date(0);
    const inherited = vi.fn(() => { throw new Error('inherited must not be spread'); });
    const prototype = Object.create(Date.prototype);
    Object.defineProperty(prototype, 'unused', { get: inherited });
    Object.setPrototypeOf(body, prototype);
    for (const [key, value] of [['code', 'start'], ['kind', 'start'], ['graphId', FORM]]) {
      Object.defineProperty(body, key, { enumerable: true, get() {
        expect(this).toBe(body);
        calls.push(key);
        return value;
      } });
    }
    const create = vi.spyOn(FlowDesignTableStore.prototype, 'createRow').mockResolvedValue({ id: 'created' });
    expect(await service.createGraphNode(GRAPH, body)).toEqual({ id: 'created' });
    expect(calls).toEqual(['code', 'kind', 'graphId']);
    expect(inherited).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledExactlyOnceWith('nodes', { graphId: GRAPH, code: 'start', kind: 'start' });
  });

  it('public service guards preserve thrown getter identity before downstream work', () => {
    const marker = new Error('getter identity');
    const forms = new FlowFormsService({} as never, {} as never);
    const create = vi.spyOn(forms, 'createFill');
    try { forms.createFillFromBody({ get formId() { throw marker; } }); throw new Error('expected getter to throw'); } catch (error) { expect(error).toBe(marker); }
    expect(create).not.toHaveBeenCalled();
    const design = new FlowDesignService({} as never, {} as never);
    const write = vi.spyOn(FlowDesignTableStore.prototype, 'createRow');
    try { design.createGraphNode(GRAPH, { get code() { throw marker; } }); throw new Error('expected getter to throw'); } catch (error) { expect(error).toBe(marker); }
    expect(write).not.toHaveBeenCalled();
  });
});

describe('graph publish metadata shallow guards preserve reads and scalar domains', () => {
  it.each([null, undefined, [], 'meta', 1, true, () => ({})].map((value) => ({ value })))('rejects invalid outer/publish boundary %#', ({ value }) => {
    expect(graphPublishMeta(value)).toBeNull();
    expect(graphPublishMeta({ publish: value })).toBeNull();
  });

  it.each([0, -2, 1.5, Number.MAX_VALUE])('accepts every finite numeric version, including %s', (version) => {
    expect(graphPublishMeta({ publish: { publishedVersion: version, publishedAt: '', publishedBy: '' } }))
      .toEqual({ publishedVersion: version, publishedAt: '', publishedBy: '' });
  });

  it.each([NaN, Infinity, -Infinity, '2', null, undefined])('rejects invalid version %# after timestamp read and before publisher', (version) => {
    const reads: string[] = [];
    expect(graphPublishMeta({ publish: {
      get publishedVersion() { reads.push('version'); return version; },
      get publishedAt() { reads.push('at'); return 'timestamp'; },
      get publishedBy() { reads.push('by'); throw new Error('must not read invalid publisher'); },
    } })).toBeNull();
    expect(reads).toEqual(['version', 'at']);
  });

  it.each([null, undefined, 0, false, new Date(0), []].map((publishedAt) => ({ publishedAt })))('rejects non-string timestamp %# without reading publisher', ({ publishedAt }) => {
    const publisher = vi.fn(() => 'actor');
    expect(graphPublishMeta({ publish: { publishedVersion: 1, publishedAt, get publishedBy() { return publisher(); } } })).toBeNull();
    expect(publisher).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 0, false, {}, [], Object('actor')].map((publishedBy) => ({ publishedBy })))('normalizes non-string publisher %# to null', ({ publishedBy }) => {
    expect(graphPublishMeta({ publish: { publishedVersion: 1, publishedAt: 'not necessarily ISO', publishedBy } }))
      .toEqual({ publishedVersion: 1, publishedAt: 'not necessarily ISO', publishedBy: null });
  });

  it('reads inherited metadata fields once in original order with actual receiver identities', () => {
    const reads: string[] = [];
    class Publish extends Date {
      get publishedVersion() { expect(this).toBe(publish); reads.push('version'); return 2; }
      get publishedAt() { expect(this).toBe(publish); reads.push('at'); return 'at'; }
      get publishedBy() { expect(this).toBe(publish); reads.push('by'); return 'actor'; }
    }
    const publish = new Publish(0);
    class Meta {
      get publish() { expect(this).toBe(meta); reads.push('publish'); return publish; }
    }
    const meta = new Meta();
    expect(graphPublishMeta(meta)).toEqual({ publishedVersion: 2, publishedAt: 'at', publishedBy: 'actor' });
    expect(reads).toEqual(['publish', 'version', 'at', 'by']);
    const row = { id: GRAPH, meta, opaque: new Date(0) };
    const mapped = withGraphPublishState(row);
    expect(mapped.status).toBe('published');
    expect(mapped.meta).toBe(meta);
    expect(mapped.opaque).toBe(row.opaque);
  });

  it.each(['publish', 'publishedVersion', 'publishedAt', 'publishedBy'])('preserves %s getter exception identity and stops subsequent reads', (field) => {
    const marker = new Error(field);
    const reads: string[] = [];
    const publish: Record<string, unknown> = {};
    for (const [key, value] of [['publishedVersion', 1], ['publishedAt', 'at'], ['publishedBy', 'actor']]) {
      Object.defineProperty(publish, String(key), { get() {
        reads.push(String(key));
        if (key === field) throw marker;
        return value;
      } });
    }
    const meta = { get publish() { reads.push('publish'); if (field === 'publish') throw marker; return publish; } };
    try { graphPublishMeta(meta); throw new Error('expected getter to throw'); } catch (error) { expect(error).toBe(marker); }
    const order = ['publish', 'publishedVersion', 'publishedAt', 'publishedBy'];
    expect(reads).toEqual(order.slice(0, order.indexOf(field) + 1));
  });
});
