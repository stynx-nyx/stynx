import type { FetchLike, HttpRequestInitLike, HttpResponseLike } from '@stynx-web/sdk';
import { ApiClientError, FrontendSessionManager, InMemoryTokenStore, StynxApiClient } from '@stynx-web/sdk';

const encodeBase64Url = (value: string): string => {
  return Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const buildJwt = (payload: Record<string, unknown>): string => {
  const encodedHeader = encodeBase64Url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  return `${encodedHeader}.${encodedPayload}.signature`;
};

const response = (init: Partial<HttpResponseLike>): HttpResponseLike => {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: init.headers,
    text: init.text ?? (async () => ''),
  };
};

describe('StynxApiClient', () => {
  it('injects auth and tenant headers', async () => {
    const requests: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const tokenStore = new InMemoryTokenStore();
    const session = new FrontendSessionManager(tokenStore);
    session.setTokens({
      accessToken: buildJwt({
        sub: 'user-1',
        tenant_id: 'tenant-1',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    });

    const fetchFn: FetchLike = async (url, init) => {
      requests.push({ url, init });
      return response({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ ok: true }),
      });
    };

    const client = new StynxApiClient({
      baseUrl: 'https://api.test',
      fetchFn,
      sessionManager: session,
      tenantResolver: () => 'tenant-1',
    });

    await expect(client.get('/health')).resolves.toEqual({ ok: true });
    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.init?.headers?.Authorization).toMatch(/^Bearer /);
    expect(request?.init?.headers?.['x-tenant-id']).toBe('tenant-1');
  });

  it('throws ApiClientError on non-ok status', async () => {
    const fetchFn: FetchLike = async () => {
      return response({
        ok: false,
        status: 403,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ error: 'forbidden' }),
      });
    };

    const client = new StynxApiClient({
      baseUrl: 'https://api.test',
      fetchFn,
    });

    await expect(client.get('/secure')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('serializes query params and request body', async () => {
    const requests: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const fetchFn: FetchLike = async (url, init) => {
      requests.push({ url, init });
      return response({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ id: 'created' }),
      });
    };

    const client = new StynxApiClient({
      baseUrl: 'https://api.test',
      fetchFn,
    });

    await expect(
      client.post('/items', { label: 'hello' }, { query: { dryRun: true } }),
    ).resolves.toEqual({ id: 'created' });

    expect(requests[0]?.url).toBe('https://api.test/items?dryRun=true');
    expect(requests[0]?.init?.headers?.['content-type']).toBe('application/json');
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ label: 'hello' }));
  });
});
