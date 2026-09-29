import '@angular/compiler';
import {
  HttpClient,
  HttpContext,
  HttpHeaders,
  HttpParams,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom, retry } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  canonicalJson,
  createIdempotencyKey,
  IdempotencyCryptoUnavailableError,
  IdempotencyKeyInterceptor,
  provideStynxAngular,
  provideStynxIdempotency,
  sha256Hex,
  STYNX_IDEMPOTENCY_COMMAND,
  StynxAngularModule,
} from '../src';

const HASHED_BODY = { b: 2, a: 1 };
const HASHED_BODY_DIGEST = '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777';

function idempotencyContext(command: { key: string } | {
  action: string;
  target: string;
  includeBodyHash: true;
}): HttpContext {
  return new HttpContext().set(STYNX_IDEMPOTENCY_COMMAND, command);
}

function configureOptInHttpClient(): HttpTestingController {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
      provideStynxIdempotency(),
    ],
  });
  return TestBed.inject(HttpTestingController);
}

function expectNoRequest(http: HttpTestingController): void {
  http.expectNone(() => true);
}

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (!String(error).includes('Cannot set base providers')) {
      throw error;
    }
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-nyx/angular idempotency opt-in', () => {
  it('leaves requests from provideStynxAngular and StynxAngularModule.forRoot unmarked', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideStynxAngular({ apiBaseUrl: '/api', sessionMode: 'cookie' }),
        provideHttpClientTesting(),
      ],
    });
    const standaloneHttp = TestBed.inject(HttpClient);
    const standaloneRequests = TestBed.inject(HttpTestingController);

    const standalone = firstValueFrom(standaloneHttp.post('/commands/standalone', { ok: true }));
    const standaloneRequest = standaloneRequests.expectOne('/commands/standalone');
    expect(standaloneRequest.request.headers.has('Idempotency-Key')).toBe(false);
    standaloneRequest.flush({ ok: true });
    await expect(standalone).resolves.toEqual({ ok: true });
    standaloneRequests.verify();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [StynxAngularModule.forRoot({ apiBaseUrl: '/api', sessionMode: 'cookie' })],
      providers: [provideHttpClientTesting()],
    });
    const moduleHttp = TestBed.inject(HttpClient);
    const moduleRequests = TestBed.inject(HttpTestingController);

    const module = firstValueFrom(moduleHttp.post('/commands/module', { ok: true }));
    const moduleRequest = moduleRequests.expectOne('/commands/module');
    expect(moduleRequest.request.headers.has('Idempotency-Key')).toBe(false);
    moduleRequest.flush({ ok: true });
    await expect(module).resolves.toEqual({ ok: true });
    moduleRequests.verify();
  });

  it('registers the interceptor only through the explicit provider and rejects duplicate registration', async () => {
    const http = configureOptInHttpClient();
    const client = TestBed.inject(HttpClient);
    expect(TestBed.inject(IdempotencyKeyInterceptor)).toBeInstanceOf(IdempotencyKeyInterceptor);

    const sent = firstValueFrom(
      client.post('/commands/create', { ok: true }, {
        context: idempotencyContext({ key: 'create-1' }),
      }),
    );
    const request = http.expectOne('/commands/create');
    expect(request.request.headers.get('Idempotency-Key')).toBe('create-1');
    request.flush({ ok: true });
    await expect(sent).resolves.toEqual({ ok: true });
    http.verify();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        provideStynxIdempotency(),
        provideStynxIdempotency(),
      ],
    });
    expect(() => TestBed.inject(HttpClient)).toThrow(/idempotency/i);
  });

  it('adds explicit stable keys to command methods only and preserves caller headers', async () => {
    const http = configureOptInHttpClient();
    const client = TestBed.inject(HttpClient);

    const commands: ReadonlyArray<['POST' | 'PUT' | 'PATCH' | 'DELETE', string]> = [
      ['POST', '/commands/post'],
      ['PUT', '/commands/put'],
      ['PATCH', '/commands/patch'],
      ['DELETE', '/commands/delete'],
    ];
    const outcomes = commands.map(([method, url]) => firstValueFrom(
      client.request(method, url, {
        body: method === 'DELETE' ? undefined : { method },
        context: idempotencyContext({ key: `stable-${method}` }),
      }),
    ));
    for (const [method, url] of commands) {
      const request = http.expectOne(url);
      expect(request.request.method).toBe(method);
      expect(request.request.headers.get('Idempotency-Key')).toBe(`stable-${method}`);
      request.flush({ method });
    }
    await expect(Promise.all(outcomes)).resolves.toHaveLength(4);

    const callerHeader = firstValueFrom(client.post('/commands/caller-key', { ok: true }, {
      context: idempotencyContext({ key: 'generated-key' }),
      headers: new HttpHeaders({ 'Idempotency-Key': 'caller-key' }),
    }));
    const callerRequest = http.expectOne('/commands/caller-key');
    expect(callerRequest.request.headers.get('Idempotency-Key')).toBe('caller-key');
    callerRequest.flush({ ok: true });
    await expect(callerHeader).resolves.toEqual({ ok: true });
    http.verify();
  });

  it('skips GET, HEAD, SSE, and unmarked requests even when they carry a command context', async () => {
    const http = configureOptInHttpClient();
    const client = TestBed.inject(HttpClient);
    const command = idempotencyContext({ key: 'ignored-key' });

    const requests = [
      firstValueFrom(client.get('/commands/get', { context: command })),
      firstValueFrom(client.head('/commands/head', { context: command })),
      firstValueFrom(client.post('/commands/sse', { ok: true }, {
        context: command,
        headers: new HttpHeaders({ Accept: 'text/event-stream' }),
      })),
      firstValueFrom(client.post('/commands/unmarked', { ok: true })),
    ];
    for (const url of ['/commands/get', '/commands/head', '/commands/sse', '/commands/unmarked']) {
      const request = http.expectOne(url);
      expect(request.request.headers.has('Idempotency-Key')).toBe(false);
      request.flush({ ok: true });
    }
    await expect(Promise.all(requests)).resolves.toHaveLength(4);
    http.verify();
  });

  it('uses canonical JSON body hashes and keeps the same key across a retry', async () => {
    const http = configureOptInHttpClient();
    const client = TestBed.inject(HttpClient);
    const command = {
      action: 'record.create',
      target: 'record-7',
      includeBodyHash: true,
    } as const;
    const response = firstValueFrom(client.post('/commands/retry', HASHED_BODY, {
      context: idempotencyContext(command),
      headers: new HttpHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
    }).pipe(retry(1)));

    const first = await vi.waitFor(() => http.expectOne('/commands/retry'));
    const expectedKey = `record.create:record-7:${HASHED_BODY_DIGEST}`;
    expect(first.request.headers.get('Idempotency-Key')).toBe(expectedKey);
    first.flush({ message: 'retry' }, { status: 503, statusText: 'Unavailable' });
    const second = await vi.waitFor(() => http.expectOne('/commands/retry'));
    expect(second.request.headers.get('Idempotency-Key')).toBe(expectedKey);
    second.flush({ ok: true });
    await expect(response).resolves.toEqual({ ok: true });
    http.verify();
  });

  it('rejects invalid hash commands before a request can reach the transport', async () => {
    const http = configureOptInHttpClient();
    const client = TestBed.inject(HttpClient);
    const validCommand = {
      action: 'record.create',
      target: 'record-7',
      includeBodyHash: true,
    } as const;
    const invalidBodies: ReadonlyArray<unknown> = [
      '{"already":"serialized"}',
      new FormData(),
      new Blob(['body']),
      new ArrayBuffer(2),
      new HttpParams().set('q', '1'),
      null,
      undefined,
      { required: 1, optional: undefined },
    ];

    for (const body of invalidBodies) {
      await expect(firstValueFrom(client.post('/commands/invalid-body', body, {
        context: idempotencyContext(validCommand),
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      }))).rejects.toThrow();
      expectNoRequest(http);
    }

    await expect(firstValueFrom(client.delete('/commands/delete-without-body', {
      context: idempotencyContext(validCommand),
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    }))).rejects.toThrow();
    expectNoRequest(http);

    const explicitDelete = firstValueFrom(client.delete('/commands/delete-without-body', {
      context: idempotencyContext({ key: 'delete-7' }),
    }));
    const deleteRequest = http.expectOne('/commands/delete-without-body');
    expect(deleteRequest.request.headers.get('Idempotency-Key')).toBe('delete-7');
    deleteRequest.flush({ ok: true });
    await expect(explicitDelete).resolves.toEqual({ ok: true });
    http.verify();
  });

  it('rejects invalid action, target, and explicit keys before sending', async () => {
    const http = configureOptInHttpClient();
    const client = TestBed.inject(HttpClient);
    const invalidCommands = [
      { action: '', target: 'target', includeBodyHash: true },
      { action: 'action:colon', target: 'target', includeBodyHash: true },
      { action: 'action\n', target: 'target', includeBodyHash: true },
      { action: 'ação', target: 'target', includeBodyHash: true },
      { action: 'a'.repeat(81), target: 'target', includeBodyHash: true },
      { key: '' },
      { key: 'key\twith-control' },
      { key: 'chave-á' },
      { key: 'k'.repeat(256) },
    ] as const;

    for (const command of invalidCommands) {
      await expect(firstValueFrom(client.post('/commands/invalid-key', HASHED_BODY, {
        context: idempotencyContext(command),
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      }))).rejects.toThrow();
      expectNoRequest(http);
    }
    http.verify();
  });
});

describe('@stynx-nyx/angular idempotency canonical wire vectors', () => {
  it('canonicalizes recursive keys by Unicode code point, preserves arrays, null, -0, and JSON escaping', () => {
    const bmpPrivateUse = '\uE000';
    const astral = '\u{10000}';
    expect(canonicalJson({ z: { b: 2, a: 1 }, a: [null, -0, 'line\n"quote"'] })).toBe(
      '{"a":[null,0,"line\\n\\"quote\\""],"z":{"a":1,"b":2}}',
    );
    expect(canonicalJson({ [astral]: 'astral', [bmpPrivateUse]: 'bmp' })).toBe(
      `{"${bmpPrivateUse}":"bmp","${astral}":"astral"}`,
    );
    expect(canonicalJson(null)).toBe('null');
  });

  it('runs toJSON with JSON.stringify property, index, and root keys before canonicalization', () => {
    const seen: string[] = [];
    const object = {
      item: {
        toJSON(key: string) {
          seen.push(key);
          return { z: 1, a: 2 };
        },
      },
    };
    const array = [{
      toJSON(key: string) {
        seen.push(key);
        return 'array-value';
      },
    }];
    const root = {
      toJSON(key: string) {
        seen.push(key);
        return { b: 2, a: 1 };
      },
    };

    expect(canonicalJson(object)).toBe('{"item":{"a":2,"z":1}}');
    expect(canonicalJson(array)).toBe('["array-value"]');
    expect(canonicalJson(root)).toBe('{"a":1,"b":2}');
    expect(seen).toEqual(['item', '0', '']);
  });

  it('rejects non-wire JSON values instead of silently changing their canonical body', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const sparse: unknown[] = [];
    sparse[0] = 1;
    sparse[2] = 3;
    const invalid: ReadonlyArray<unknown> = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      sparse,
      { optional: undefined },
      { callback: () => undefined },
      { marker: Symbol('marker') },
      [undefined],
      [() => undefined],
      [Symbol('marker')],
      new Map([['a', 1]]),
      new Set([1]),
      1n,
      cyclic,
    ];

    for (const value of invalid) {
      expect(() => canonicalJson(value)).toThrow();
    }
    expect(JSON.stringify({ required: 1, optional: undefined })).toBe('{"required":1}');
    expect(() => canonicalJson({ required: 1, optional: undefined })).toThrow();
  });

  it('rejects arrays with extra own properties or symbol keys and sorts prefix keys correctly', () => {
    const decorated = [1] as number[] & { extra?: number };
    decorated.extra = 2;
    const symbolKeyed = [1] as number[] & { [key: symbol]: number };
    symbolKeyed[Symbol('extra')] = 2;

    expect(() => canonicalJson(decorated)).toThrow(/array contains a property/i);
    expect(() => canonicalJson(symbolKeyed)).toThrow(/symbol property/i);
    expect(canonicalJson({ aa: 2, a: 1, ab: 3 })).toBe('{"a":1,"aa":2,"ab":3}');
    expect(canonicalJson([1, 2])).toBe('[1,2]');
  });

  it('requires an explicit body-hash opt-in and accepts JSON arrays', async () => {
    const http = configureOptInHttpClient();
    const client = TestBed.inject(HttpClient);
    const invalid = firstValueFrom(client.post('/commands/disabled-hash', { ok: true }, {
      context: idempotencyContext({ action: 'record.create', target: 'record-7', includeBodyHash: false } as never),
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    }));
    await expect(invalid).rejects.toThrow(/body-hash/i);
    expectNoRequest(http);

    const sent = firstValueFrom(client.post('/commands/array-hash', [1, 2], {
      context: idempotencyContext({ action: 'record.create', target: 'record-7', includeBodyHash: true }),
      headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
    }));
    const request = await vi.waitFor(() => http.expectOne('/commands/array-hash'));
    expect(request.request.headers.get('Idempotency-Key')).toMatch(/^record\.create:record-7:[a-f0-9]{64}$/);
    request.flush({ ok: true });
    await expect(sent).resolves.toEqual({ ok: true });
    http.verify();
  });

  it('requires Content-Type when hashing an otherwise valid JSON object', async () => {
    const http = configureOptInHttpClient();
    const client = TestBed.inject(HttpClient);

    await expect(firstValueFrom(client.post('/commands/missing-content-type', { ok: true }, {
      context: idempotencyContext({ action: 'record.create', target: 'record-7', includeBodyHash: true }),
    }))).rejects.toThrow(/application\/json/i);
    expectNoRequest(http);
    http.verify();
  });

  it('hashes UTF-8 canonical JSON as lowercase SHA-256 and builds the CTG5-compatible body key', async () => {
    expect(await sha256Hex('{"a":1,"b":2}')).toBe(HASHED_BODY_DIGEST);
    expect(await sha256Hex(new TextEncoder().encode('{"a":1,"b":2}'))).toBe(HASHED_BODY_DIGEST);
    expect(await sha256Hex(new TextEncoder().encode('{"a":1,"b":2}').buffer)).toBe(HASHED_BODY_DIGEST);
    await expect(createIdempotencyKey('record.create', 'record-7', HASHED_BODY)).resolves.toBe(
      `record.create:record-7:${HASHED_BODY_DIGEST}`,
    );
  });

  it('fails before transport when Web Crypto is unavailable and never emits a partial hash key', async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    try {
      await expect(sha256Hex('body')).rejects.toBeInstanceOf(IdempotencyCryptoUnavailableError);

      const http = configureOptInHttpClient();
      const client = TestBed.inject(HttpClient);
      await expect(firstValueFrom(client.post('/commands/no-crypto', HASHED_BODY, {
        context: idempotencyContext({
          action: 'record.create',
          target: 'record-7',
          includeBodyHash: true,
        }),
        headers: new HttpHeaders({ 'Content-Type': 'application/json' }),
      }))).rejects.toBeInstanceOf(IdempotencyCryptoUnavailableError);
      expectNoRequest(http);
      http.verify();
    } finally {
      Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto });
    }
  });
});
