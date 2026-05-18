import type { AuthProvider } from '../src/auth-provider';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
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

  it('uses client method default options and parses empty or inferred JSON bodies', async () => {
    const bodies = ['', '[1,2]', '{bad', '{}'];
    const client = new StynxSdkClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(200, bodies.shift() ?? '{}'),
    });

    await expect(client.get('/empty')).resolves.toBeUndefined();
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
});
