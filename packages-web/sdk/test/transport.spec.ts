import type { AuthProvider } from '../src/auth-provider';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  StynxSdkError,
  UnauthorizedError,
  ValidationError,
} from '../src/errors';
import type { FetchLike, HttpHeadersLike, HttpRequestInitLike, HttpResponseLike } from '../src/http';
import { StynxSdkClient } from '../src/client';
import type { TenantProvider } from '../src/tenant-provider';

class TestHeaders implements HttpHeadersLike {
  constructor(private readonly values: Record<string, string>) {}

  get(name: string): string | null {
    const match = Object.entries(this.values).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return match?.[1] ?? null;
  }
}

function response(status: number, body: string, headers: Record<string, string> = {}): HttpResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new TestHeaders(headers),
    text: async () => body,
  };
}

describe('@stynx-web/sdk transport', () => {
  it('forwards client method wrappers to transport with exact methods, paths, bodies, and options', async () => {
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(200, '{}', { 'content-type': 'application/json' }),
    });
    const request = vi.spyOn(client.transport, 'request').mockResolvedValue({ ok: true });

    await client.get('/get', { query: { page: 1 } });
    await client.post('/post', { name: 'demo' }, { tenantId: 'tenant-1' });
    await client.put('/put', { enabled: true });
    await client.patch('/patch', { name: 'patched' });
    await client.delete('/delete', { headers: { 'x-test': '1' } });

    expect(request.mock.calls).toEqual([
      [{ method: 'GET', path: '/get', query: { page: 1 } }],
      [{ method: 'POST', path: '/post', body: { name: 'demo' }, tenantId: 'tenant-1' }],
      [{ method: 'PUT', path: '/put', body: { enabled: true } }],
      [{ method: 'PATCH', path: '/patch', body: { name: 'patched' } }],
      [{ method: 'DELETE', path: '/delete', headers: { 'x-test': '1' } }],
    ]);
  });

  it('injects bearer and tenant headers on requests', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, init });
      return response(200, '{"status":"ok"}', { 'content-type': 'application/json' });
    };
    const authProvider: AuthProvider = {
      getAccessToken: async () => 'token-1',
      refresh: async () => null,
    };
    const tenantProvider: TenantProvider = {
      getTenantId: async () => 'tenant-1',
    };

    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test/',
      fetchFn,
      authProvider,
      tenantProvider,
      defaultHeaders: {
        'x-stynx-source': 'sdk-test',
      },
    });

    const result = await client.get<{ status: string }>('/health', {
      query: { page: 1, active: true },
    });

    expect(result.status).toBe('ok');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.example.test/health?page=1&active=true');
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'x-tenant-id': 'tenant-1',
      'x-stynx-source': 'sdk-test',
    });
  });

  it('serializes falsy query values and URL-encodes caller filters without dropping them', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return response(200, '{"ok":true}', { 'content-type': 'application/json' });
      },
    });

    await client.get('/records/search', {
      query: {
        active: false,
        page: 0,
        filter: 'status:open owner:a/b',
      },
    });

    expect(calls[0]?.url).toBe(
      'https://api.example.test/records/search?active=false&page=0&filter=status%3Aopen+owner%3Aa%2Fb',
    );
    expect(calls[0]?.init?.method).toBe('GET');
  });

  it('preserves caller headers and omits empty query and tenant values', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test///',
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return response(200, 'plain ok', { 'content-type': 'text/plain' });
      },
      authProvider: {
        getAccessToken: async () => 'provider-token',
        refresh: async () => null,
      },
      tenantProvider: {
        getTenantId: async () => 'tenant-provider',
      },
    });

    await expect(client.get('/health', {
      tenantId: null,
      query: { keep: 'yes', skipNull: null, skipUndefined: undefined },
      headers: {
        authorization: 'Bearer caller-token',
        'X-Tenant-Id': 'tenant-caller',
      },
    })).resolves.toBe('plain ok');

    expect(calls[0]?.url).toBe('https://api.example.test/health?keep=yes');
    expect(calls[0]?.init?.headers).toMatchObject({
      authorization: 'Bearer caller-token',
      'X-Tenant-Id': 'tenant-caller',
    });
  });

  it('omits empty query strings and forwards request signal options', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const signal = new AbortController().signal;
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return response(200, '{"ok":true}', { 'content-type': 'application/json' });
      },
    });

    await client.get('/health', {
      query: { skipNull: null, skipUndefined: undefined },
      signal,
    });

    expect(calls[0]?.url).toBe('https://api.example.test/health');
    expect(calls[0]?.init?.signal).toBe(signal);
  });

  it('preserves nested path slashes and omits absent signal/body fields', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test///',
      fetchFn: async (url, init) => {
        calls.push({ url: typeof url === 'string' ? url : (url as Request).url, init });
        return response(200, '{}', { 'content-type': 'application/json' });
      },
    });

    await client.get('nested///records');
    await client.get('///triple');

    expect(calls[0]?.url).toBe('https://api.example.test/nested///records');
    expect(Object.hasOwn(calls[0]!.init!, 'signal')).toBe(false);
    expect(Object.hasOwn(calls[0]!.init!, 'body')).toBe(false);
    expect(calls[0]?.init?.headers).toEqual({});
    expect(calls[1]?.url).toBe('https://api.example.test/triple');
  });

  it('uses client method default options and parses empty or inferred JSON bodies', async () => {
    const bodies = ['', '[1,2]', '{bad', '{}'];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(200, bodies.shift() ?? '{}'),
    });

    await expect(client.get('/empty')).resolves.toBe(undefined);
    await expect(client.put('/array', { ok: true })).resolves.toEqual([1, 2]);
    await expect(client.patch('/invalid-json', { ok: true })).resolves.toBe('{bad');
    await expect(client.delete('/default-options')).resolves.toEqual({});
  });

  it('refreshes once after a 401 and replays the request', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    let refreshCalls = 0;
    let currentToken = 'expired-token';
    const authProvider: AuthProvider = {
      getAccessToken: async () => currentToken,
      refresh: async () => {
        refreshCalls += 1;
        currentToken = 'fresh-token';
        return currentToken;
      },
    };
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (calls.length === 1) {
        return response(401, '{"code":"AUTHENTICATION_ERROR","message":"expired"}', {
          'content-type': 'application/json',
        });
      }
      return response(200, '{"ok":true}', { 'content-type': 'application/json' });
    };

    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn,
      authProvider,
    });

    const result = await client.post<{ ok: boolean }>('/records', { name: 'demo' });

    expect(result.ok).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.init?.headers?.Authorization).toBe('Bearer fresh-token');
  });

  it('maps response codes to typed error instances and calls onAuthFailure after unrecoverable 401', async () => {
    const authFailures: unknown[] = [];
    const authProvider: AuthProvider = {
      getAccessToken: async () => 'expired-token',
      refresh: async () => null,
      onAuthFailure: async (error) => {
        authFailures.push(error);
      },
    };
    const unauthorizedFetch: FetchLike = async () => (
      response(401, '{"code":"AUTHENTICATION_ERROR","message":"expired"}', {
        'content-type': 'application/json',
      })
    );

    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: unauthorizedFetch,
      authProvider,
    });

    await expect(client.get('/secure')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(authFailures).toHaveLength(1);

    const forbiddenClient = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(403, '{"code":"TENANT_ACCESS_DENIED","message":"no"}', {
        'content-type': 'application/json',
      }),
    });
    await expect(forbiddenClient.get('/tenant')).rejects.toBeInstanceOf(ForbiddenError);

    const validationClient = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(422, '{"code":"STORAGE_VALIDATION_ERROR","message":"bad"}', {
        'content-type': 'application/json',
      }),
    });
    await expect(validationClient.post('/storage', { bad: true })).rejects.toBeInstanceOf(ValidationError);
  });

  it('preserves content-type headers and surfaces repeated 401 responses after refresh', async () => {
    const authFailures: unknown[] = [];
    const calls: Array<{ init?: HttpRequestInitLike }> = [];
    const authProvider: AuthProvider = {
      getAccessToken: async () => 'expired-token',
      refresh: async () => 'fresh-token',
      onAuthFailure: async (error) => {
        authFailures.push(error);
      },
    };
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async (_url, init) => {
        calls.push({ init });
        return response(401, '{"message":"still expired"}', { 'content-type': 'application/json' });
      },
      authProvider,
    });

    await expect(client.post('/secure', { ok: true }, {
      headers: { 'Content-Type': 'application/vnd.api+json' },
    })).rejects.toBeInstanceOf(UnauthorizedError);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.init?.headers?.['Content-Type']).toBe('application/vnd.api+json');
    expect(authFailures).toHaveLength(0);
  });

  it('maps remaining status codes and validation code suffixes', async () => {
    const cases: Array<[number, string, unknown]> = [
      [404, '{"message":"missing"}', NotFoundError],
      [409, '{"message":"conflict"}', ConflictError],
      [429, '{"message":"slow down"}', RateLimitError],
      [400, '{"message":"bad request"}', ValidationError],
      [500, '{"code":"CUSTOM_VALIDATION_ERROR"}', ValidationError],
      [503, '"unavailable"', Error],
    ];

    for (const [status, body, errorClass] of cases) {
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async () => response(status, body, { 'content-type': 'application/json' }),
      });
      await expect(client.get('/error')).rejects.toBeInstanceOf(errorClass as never);
    }
  });

  it('surfaces network failures and preserves abort signals for caller cancellation', async () => {
    const signal = new AbortController().signal;
    const networkClient = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => {
        throw new TypeError('network offline');
      },
    });

    await expect(networkClient.get('/offline')).rejects.toThrow('network offline');

    const calls: Array<{ init?: HttpRequestInitLike }> = [];
    const abortingClient = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async (_url, init) => {
        calls.push({ init });
        throw new DOMException('The operation was aborted.', 'AbortError');
      },
    });

    await expect(abortingClient.get('/slow', { signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(calls[0]?.init?.signal).toBe(signal);
  });

  it('maps context payloads and 401 responses without an auth provider', async () => {
    const contextClient = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(409, '{"message":"conflict","context":{"field":"email"}}', {
        'content-type': 'application/json',
      }),
    });

    await expect(contextClient.get('/conflict')).rejects.toMatchObject({
      context: { field: 'email' },
    });

    const anonymousClient = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(401, '{"message":"login required"}', {
        'content-type': 'application/json',
      }),
    });

    await expect(anonymousClient.get('/secure')).rejects.toBeInstanceOf(UnauthorizedError);
  });

  // =========================================================================
  // WAVE-05A Phase 3 — sdk/transport.ts mutation kills.
  // =========================================================================

  it('trimEdgeSlash strips ALL trailing slashes from baseUrl (kills Regex anchor mutations)', async () => {
    const calls: Array<{ url: string }> = [];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test///',
      fetchFn: async (input: RequestInfo) => {
        calls.push({ url: typeof input === 'string' ? input : (input as Request).url });
        return response(200, '{"ok":true}', { 'content-type': 'application/json' });
      },
    });
    await client.get('/users');
    expect(calls[0]!.url).toBe('https://api.example.test/users');
  });

  it('buildQuery returns "" when query is undefined (kills StringLiteral at transport.ts:30)', async () => {
    const calls: Array<{ url: string }> = [];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async (input: RequestInfo) => {
        calls.push({ url: typeof input === 'string' ? input : (input as Request).url });
        return response(200, '{"ok":true}', { 'content-type': 'application/json' });
      },
    });
    await client.get('/users');
    expect(calls[0]!.url).toBe('https://api.example.test/users');
    expect(calls[0]!.url).not.toContain('?');
    expect(calls[0]!.url).not.toContain('Stryker');
  });

  it('buildQuery prefixes "?" only when there are non-null params', async () => {
    const calls: Array<{ url: string }> = [];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async (input: RequestInfo) => {
        calls.push({ url: typeof input === 'string' ? input : (input as Request).url });
        return response(200, '{"ok":true}', { 'content-type': 'application/json' });
      },
    });
    await client.get('/users', { query: { foo: null, bar: undefined } });
    expect(calls[0]!.url).toBe('https://api.example.test/users');
    await client.get('/users', { query: { foo: 'bar' } });
    expect(calls[1]!.url).toBe('https://api.example.test/users?foo=bar');
  });

  it('parseBody returns undefined for empty body', async () => {
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(204, '', { 'content-type': 'application/json' }),
    });
    await expect(client.get('/empty')).resolves.toBe(undefined);
  });

  it('parseBody detects JSON arrays by leading "[" (kills StringLiteral on the bracket literal)', async () => {
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(200, '[{"id":1}]', { }),
    });
    await expect(client.get('/array')).resolves.toEqual([{ id: 1 }]);
  });

  it('parseBody detects JSON objects by leading "{" (kills StringLiteral on the brace literal)', async () => {
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(200, '{"id":1}', { }),
    });
    await expect(client.get('/object')).resolves.toEqual({ id: 1 });
  });

  it('parseBody returns raw string when body is non-JSON-shaped and no content-type', async () => {
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(200, 'plain text body', { }),
    });
    await expect(client.get('/text')).resolves.toBe('plain text body');
  });

  it('uses content-type to parse JSON primitives and keeps text/plain primitives as text', async () => {
    const bodies = [' true ', 'true'];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => {
        const body = bodies.shift() ?? 'true';
        return response(200, body, {
          'content-type': body.startsWith(' ') ? 'Application/JSON; charset=utf-8' : 'text/plain',
        });
      },
    });

    await expect(client.get('/json-primitive')).resolves.toBe(true);
    await expect(client.get('/text-primitive')).resolves.toBe('true');
  });

  it('isJsonResponse handles mixed-case content-type (kills MethodExpression .toLowerCase)', async () => {
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(200, '{"ok":true}', { 'content-type': 'Application/JSON; charset=utf-8' }),
    });
    await expect(client.get('/mixed-case')).resolves.toEqual({ ok: true });
  });

  // ===========================================================================
  // WAVE-05A Turn B.3a — sdk transport hot-zone kills.
  // Targets the 5 fake-fetch scenarios + hasHeader case-insensitivity.
  // ===========================================================================

  describe('hasHeader case-insensitivity (kills MethodExpression at transport.ts:44)', () => {
    it('does not double-set Authorization when caller passes lowercase "authorization"', async () => {
      const calls: Array<{ init?: HttpRequestInitLike }> = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async (_url, init) => {
          calls.push({ init });
          return response(200, '{}', { 'content-type': 'application/json' });
        },
        authProvider: {
          getAccessToken: async () => 'provider-token',
          refresh: async () => null,
        },
      });
      await client.get('/x', { headers: { authorization: 'Bearer caller-token' } });
      // Lowercase authorization must be detected as already-set → no Bearer override.
      const sent = calls[0]!.init!.headers!;
      const authHeaders = Object.entries(sent).filter(([k]) => k.toLowerCase() === 'authorization');
      expect(authHeaders).toHaveLength(1);
      expect(authHeaders[0]![1]).toBe('Bearer caller-token');
    });

    it('does not double-set x-tenant-id when caller passes mixed-case "X-Tenant-ID"', async () => {
      const calls: Array<{ init?: HttpRequestInitLike }> = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async (_url, init) => {
          calls.push({ init });
          return response(200, '{}', { 'content-type': 'application/json' });
        },
        tenantProvider: { getTenantId: async () => 'provider-tenant' },
      });
      await client.get('/x', { headers: { 'X-Tenant-ID': 'caller-tenant' } });
      const sent = calls[0]!.init!.headers!;
      const tenantHeaders = Object.entries(sent).filter(([k]) => k.toLowerCase() === 'x-tenant-id');
      expect(tenantHeaders).toHaveLength(1);
      expect(tenantHeaders[0]![1]).toBe('caller-tenant');
    });
  });

  describe('parseBody early-return on empty body (kills ConditionalExpression at transport.ts:57)', () => {
    it('returns undefined for empty body even when content-type is application/json', async () => {
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async () => response(200, '', { 'content-type': 'application/json' }),
      });
      await expect(client.get('/empty')).resolves.toBe(undefined);
    });

    it('returns undefined for empty body without content-type', async () => {
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async () => response(204, '', {}),
      });
      await expect(client.get('/empty')).resolves.toBe(undefined);
    });
  });

  describe('resolveTenantId precedence (kills EqualityOperator at transport.ts:78)', () => {
    it('explicit tenantId=null overrides the tenantProvider (kills `!== undefined` → `=== undefined`)', async () => {
      const calls: Array<{ init?: HttpRequestInitLike }> = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async (_url, init) => {
          calls.push({ init });
          return response(200, '{}', { 'content-type': 'application/json' });
        },
        tenantProvider: { getTenantId: async () => 'provider-tenant' },
      });
      // Explicit null should suppress the x-tenant-id header (not fall through to provider).
      await client.get('/x', { tenantId: null });
      const sent = calls[0]!.init!.headers!;
      const tenantHeaders = Object.entries(sent).filter(([k]) => k.toLowerCase() === 'x-tenant-id');
      expect(tenantHeaders).toHaveLength(0);
    });

    it('explicit tenantId=undefined falls through to the tenantProvider', async () => {
      const calls: Array<{ init?: HttpRequestInitLike }> = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async (_url, init) => {
          calls.push({ init });
          return response(200, '{}', { 'content-type': 'application/json' });
        },
        tenantProvider: { getTenantId: async () => 'provider-tenant' },
      });
      await client.get('/x');
      const sent = calls[0]!.init!.headers!;
      const tenantHeader = Object.entries(sent).find(([k]) => k.toLowerCase() === 'x-tenant-id');
      expect(tenantHeader![1]).toBe('provider-tenant');
    });
  });

  describe('refresh-and-replay sequence (kills ConditionalExpression survivors at transport.ts:133-141)', () => {
    it('does NOT replay when refresh returns null — surfaces UnauthorizedError once (kills `if (refreshed)` mutation)', async () => {
      const calls: Array<{ url: string }> = [];
      const failures: unknown[] = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async (input) => {
          calls.push({ url: typeof input === 'string' ? input : (input as Request).url });
          return response(401, '{"message":"expired"}', { 'content-type': 'application/json' });
        },
        authProvider: {
          getAccessToken: async () => 'expired',
          refresh: async () => null,  // refresh returns null → no replay
          onAuthFailure: async (e) => { failures.push(e); },
        },
      });
      await expect(client.get('/x')).rejects.toBeInstanceOf(UnauthorizedError);
      // Exactly ONE call (no replay).
      expect(calls).toHaveLength(1);
      expect(failures).toHaveLength(1);
    });

    it('passes the parsed error body to onAuthFailure (kills BlockStatement {} at transport.ts:138)', async () => {
      const failures: unknown[] = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async () => response(401, '{"code":"AUTH_EXPIRED","message":"login required"}', {
          'content-type': 'application/json',
        }),
        authProvider: {
          getAccessToken: async () => 'expired',
          refresh: async () => null,
          onAuthFailure: async (e) => { failures.push(e); },
        },
      });
      await expect(client.get('/x')).rejects.toMatchObject({ status: 401, message: 'login required' });
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ status: 401, code: 'AUTH_EXPIRED' });
    });

    it('does NOT call onAuthFailure when refresh succeeds and replay is OK', async () => {
      const failures: unknown[] = [];
      let calls = 0;
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async () => {
          calls += 1;
          if (calls === 1) {
            return response(401, '{"message":"expired"}', { 'content-type': 'application/json' });
          }
          return response(200, '{"ok":true}', { 'content-type': 'application/json' });
        },
        authProvider: {
          getAccessToken: async () => 'expired',
          refresh: async () => 'fresh',
          onAuthFailure: async (e) => { failures.push(e); },
        },
      });
      await expect(client.get('/x')).resolves.toEqual({ ok: true });
      expect(failures).toHaveLength(0);
    });
  });

  describe('body serialization + Content-Type (kills survivors at transport.ts:122-127)', () => {
    it('serializes body via JSON.stringify and sets Content-Type when not provided', async () => {
      const calls: Array<{ init?: HttpRequestInitLike }> = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async (_url, init) => {
          calls.push({ init });
          return response(200, '{}', { 'content-type': 'application/json' });
        },
      });
      await client.post('/x', { name: 'demo' });
      expect(calls[0]!.init!.body).toBe(JSON.stringify({ name: 'demo' }));
      expect((calls[0]!.init!.headers as Record<string, string>)['content-type']).toBe('application/json');
    });

    it('does NOT set Content-Type when caller already provided one (case-insensitive)', async () => {
      const calls: Array<{ init?: HttpRequestInitLike }> = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async (_url, init) => {
          calls.push({ init });
          return response(200, '{}', { 'content-type': 'application/json' });
        },
      });
      await client.post('/x', { name: 'demo' }, { headers: { 'Content-Type': 'application/vnd.example+json' } });
      const sent = calls[0]!.init!.headers as Record<string, string>;
      // Only one content-type header, with the caller's value.
      const ctHeaders = Object.entries(sent).filter(([k]) => k.toLowerCase() === 'content-type');
      expect(ctHeaders).toHaveLength(1);
      expect(ctHeaders[0]![1]).toBe('application/vnd.example+json');
    });

    it('omits body when request.body is undefined (kills ConditionalExpression at transport.ts:122)', async () => {  // legacy header for the test below
      const calls: Array<{ init?: HttpRequestInitLike }> = [];
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async (_url, init) => {
          calls.push({ init });
          return response(200, '{}', { 'content-type': 'application/json' });
        },
      });
      await client.get('/x');
      expect(calls[0]!.init!.body).toBe(undefined);
    });
  });

  // ===========================================================================
  // WAVE-05A Turn B.3a — errors.ts per-class mutation kills.
  // Each kills the StringLiteral / ConditionalExpression mutants at L51-72.
  // ===========================================================================

  describe('errors.ts createStynxSdkError per-class mapping', () => {
    async function callWith(status: number, body: string) {
      let captured: unknown;
      const client = new StynxSdkClient({
        baseUrl: 'https://api.example.test',
        fetchFn: async () => response(status, body, { 'content-type': 'application/json' }),
      });
      try { await client.get('/x'); } catch (e) { captured = e; }
      return captured;
    }

    it('401 → UnauthorizedError with status, message, code (kills L51 StringLiteral)', async () => {
      const e = await callWith(401, '{"code":"AUTH_X","message":"login required"}');
      expect(e).toBeInstanceOf(UnauthorizedError);
      expect((e as UnauthorizedError).status).toBe(401);
      expect((e as UnauthorizedError).code).toBe('AUTH_X');
      expect((e as UnauthorizedError).message).toBe('login required');
    });

    it('403 → ForbiddenError with status (kills L54 EqualityOperator/ConditionalExpression)', async () => {
      const e = await callWith(403, '{"message":"no access"}');
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as ForbiddenError).status).toBe(403);
    });

    it('404 → NotFoundError', async () => {
      const e = await callWith(404, '{"message":"gone"}');
      expect(e).toBeInstanceOf(NotFoundError);
    });

    it('409 → ConflictError', async () => {
      const e = await callWith(409, '{"message":"conflict"}');
      expect(e).toBeInstanceOf(ConflictError);
    });

    it('429 → RateLimitError', async () => {
      const e = await callWith(429, '{"message":"slow"}');
      expect(e).toBeInstanceOf(RateLimitError);
    });

    it('400 → ValidationError (kills L67-68 EqualityOperator)', async () => {
      const e = await callWith(400, '{"message":"bad"}');
      expect(e).toBeInstanceOf(ValidationError);
    });

    it('422 → ValidationError (kills L68 status === 422 → !== 422 mutation)', async () => {
      const e = await callWith(422, '{"message":"unprocessable"}');
      expect(e).toBeInstanceOf(ValidationError);
    });

    it('500 with code ending in _VALIDATION_ERROR → ValidationError (kills L69 StringLiteral suffix)', async () => {
      const e = await callWith(500, '{"code":"CUSTOM_VALIDATION_ERROR","message":"bad"}');
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).code).toBe('CUSTOM_VALIDATION_ERROR');
    });

    it('500 with code NOT ending in _VALIDATION_ERROR → generic StynxSdkError, not ValidationError', async () => {
      const e = await callWith(500, '{"code":"INTERNAL_FAILURE","message":"oops"}');
      // Mutation that flips the endsWith logic would route this as ValidationError.
      expect(e).not.toBeInstanceOf(ValidationError);
      expect((e as StynxSdkError).status).toBe(500);
    });

    it('502 with no code → generic StynxSdkError (kills BlockStatement {} on 400/422 paths)', async () => {
      const e = await callWith(502, '{"message":"gateway"}');
      expect(e).not.toBeInstanceOf(ValidationError);
      expect(e).not.toBeInstanceOf(UnauthorizedError);
      expect(e).not.toBeInstanceOf(ForbiddenError);
      expect(e).not.toBeInstanceOf(NotFoundError);
      expect(e).not.toBeInstanceOf(ConflictError);
      expect(e).not.toBeInstanceOf(RateLimitError);
      expect((e as StynxSdkError).status).toBe(502);
    });

    it('falls back to "Request failed with status N" when payload has no message (kills L35 StringLiteral)', async () => {
      const e = await callWith(404, '{}');
      expect((e as NotFoundError).message).toBe('Request failed with status 404');
    });

    it('falls back to default message when payload.message is empty string (kills L32 EqualityOperator length > 0)', async () => {
      const e = await callWith(404, '{"message":""}');
      // Empty string fails the `length > 0` check → falls through to default.
      expect((e as NotFoundError).message).toBe('Request failed with status 404');
    });

    it('preserves payload.context when present and discards when absent (kills resolveContext branches)', async () => {
      const eWith = await callWith(409, '{"message":"x","context":{"field":"email"}}');
      expect((eWith as ConflictError).context).toEqual({ field: 'email' });
      const eWithout = await callWith(409, '{"message":"x"}');
      expect((eWithout as ConflictError).context).toBe(undefined);
    });

    it('isObject rejects null payload (kills L28 LogicalOperator)', async () => {
      // null payload → resolveMessage falls back to default.
      const e = await callWith(500, 'null');
      expect((e as StynxSdkError).message).toBe('Request failed with status 500');
      expect((e as StynxSdkError).code).toBe(undefined);
    });
  });
});
