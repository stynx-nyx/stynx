import {
  ApiClientError,
  BrowserLocalStorageTokenStore,
  FrontendSessionManager,
  InMemoryTokenStore,
  StynxApiClient,
  buildCognitoHostedUiLoginUrl,
  hasAllPermissions,
  hasAnyPermission,
  hasAnyRole,
  parseJwtPayload,
} from '../src';
import type { FetchLike, HttpHeadersLike, HttpRequestInitLike, HttpResponseLike } from '../src/http';

class TestHeaders implements HttpHeadersLike {
  constructor(private readonly values: Record<string, string> = {}) {}

  get(name: string): string | null {
    const entry = Object.entries(this.values).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return entry?.[1] ?? null;
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

function token(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `h.${encoded}.s`;
}

describe('@stynx-nyx/sdk runtime helpers', () => {
  it('hydrates, derives, expires, and clears frontend sessions', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    try {
      const store = new InMemoryTokenStore();
      const manager = new FrontendSessionManager(store);
      expect(manager.hydrate()).toEqual({ tokens: null, principal: null });
      expect(manager.getValidAccessToken()).toBe(null);

      const state = manager.setTokens({
        accessToken: token({
          sub: 'user-1',
          username: 'name',
          email: 'u@example.test',
          roles: [' Admin ', '', 2],
          scope: 'records:read records:write',
          tenant_ids: ['tenant-1', 'tenant-2'],
          exp: 2,
        }),
      });

      expect(state.tokens?.expiresAt).toBe(2_000);
      expect(state.principal).toMatchObject({
        sub: 'user-1',
        username: 'name',
        email: 'u@example.test',
        tenantId: 'tenant-1',
        tenantIds: ['tenant-1', 'tenant-2'],
        roles: ['Admin'],
        permissions: ['records:read', 'records:write'],
      });
      expect(manager.getTenantId()).toBe('tenant-1');
      expect(manager.getValidAccessToken()).toBe(state.tokens?.accessToken);

      nowSpy.mockReturnValue(3_000);
      expect(manager.hydrate()).toEqual({ tokens: null, principal: null });
      expect(store.read()).toBe(null);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('supports custom claim keys and invalid token fallbacks', () => {
    const store = new InMemoryTokenStore();
    const manager = new FrontendSessionManager(store, {
      roleClaimKeys: ['r'],
      permissionClaimKeys: ['p'],
      tenantClaimKeys: ['t'],
    });

    expect(manager.setTokens({
      accessToken: token({ sub: 'user-2', r: 'owner', p: ['a', 'b'], t: 'tenant-x' }),
    }).principal).toMatchObject({
      roles: ['owner'],
      permissions: ['a', 'b'],
      tenantId: 'tenant-x',
    });
    expect(manager.setTokens({ accessToken: token({}) }).principal).toBe(null);
    expect(manager.setTokens({ accessToken: 'invalid' }).tokens).toEqual({ accessToken: 'invalid' });
    expect(manager.getTenantId()).toBe(null);
  });

  it('normalizes session claim whitespace, duplicates, and expiration boundaries', () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(2_000);
    try {
      const store = new InMemoryTokenStore();
      const manager = new FrontendSessionManager(store);

      const active = manager.setTokens({
        accessToken: token({
          sub: ' user-5 ',
          roles: [' Admin ', 'admin', '', 3],
          scope: ' records:read  records:write records:read ',
          tenant_id: '',
          tenancy_id: 'tenant-from-tenancy',
          tenant_ids: ['tenant-from-list', ' ', 7],
          exp: 3,
        }),
      });

      expect(active.principal).toMatchObject({
        sub: 'user-5',
        tenantId: 'tenant-from-tenancy',
        tenantIds: ['tenant-from-tenancy', 'tenant-from-list'],
        roles: ['Admin', 'admin'],
        permissions: ['records:read', 'records:write'],
      });
      expect(manager.getValidAccessToken()).toBe(active.tokens?.accessToken);

      store.write({ accessToken: active.tokens!.accessToken, expiresAt: 2_000 });
      expect(manager.getValidAccessToken()).toBe(null);
      expect(store.read()).toBe(null);

      expect(manager.setTokens({ accessToken: token({ sub: '   ' }) }).principal).toBe(null);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('uses default Cognito, permission, tenant, and username claim keys exactly', () => {
    const manager = new FrontendSessionManager(new InMemoryTokenStore());

    const state = manager.setTokens({
      accessToken: token({
        sub: 'user-claims',
        'cognito:username': 'cognito-user',
        'cognito:groups': 'Power Users',
        permissions: ['records:approve'],
        tenant_id: 'tenant-direct',
      }),
    });

    expect(state.principal).toMatchObject({
      sub: 'user-claims',
      username: 'cognito-user',
      tenantId: 'tenant-direct',
      tenantIds: ['tenant-direct'],
      roles: ['Power Users'],
      permissions: ['records:approve'],
    });
  });

  it('derives tenant identifiers from fallback claims and empty claims', () => {
    const store = new InMemoryTokenStore();
    const manager = new FrontendSessionManager(store);

    expect(manager.setTokens({
      accessToken: token({ sub: 'user-3', tenant_ids: ['tenant-fallback'] }),
    }).principal).toMatchObject({
      tenantId: 'tenant-fallback',
      tenantIds: ['tenant-fallback'],
    });
    expect(manager.getTenantId()).toBe('tenant-fallback');

    expect(manager.setTokens({
      accessToken: token({ sub: 'user-4' }),
    }).principal).toMatchObject({
      tenantId: null,
      tenantIds: [],
    });
    expect(manager.getTenantId()).toBe(null);
  });

  it('stores tokens in memory and browser-local storage variants', () => {
    const memory = new InMemoryTokenStore();
    const original = { accessToken: 'a', refreshToken: 'r' };
    memory.write(original);
    original.accessToken = 'mutated';
    expect(memory.read()).toEqual({ accessToken: 'a', refreshToken: 'r' });
    memory.clear();
    expect(memory.read()).toBe(null);

    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    };
    const browser = new BrowserLocalStorageTokenStore('tokens', storage);
    browser.write({ accessToken: 'stored' });
    expect(storage.setItem).toHaveBeenCalledWith('tokens', JSON.stringify({ accessToken: 'stored' }));
    expect(browser.read()).toEqual({ accessToken: 'stored' });
    values.set('tokens', '');
    expect(browser.read()).toBe(null);
    values.set('tokens', '{bad');
    expect(browser.read()).toBe(null);
    browser.clear();
    expect(values.has('tokens')).toBe(false);

    const unavailable = new BrowserLocalStorageTokenStore('tokens', null);
    unavailable.write({ accessToken: 'ignored' });
    expect(unavailable.read()).toBe(null);
    expect(() => unavailable.clear()).not.toThrow();

    const emptyStorage = new BrowserLocalStorageTokenStore('tokens', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    expect(emptyStorage.read()).toBe(null);
  });

  it('uses global localStorage when no storage provider is supplied', () => {
    const values = new Map<string, string>();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: vi.fn((key: string) => values.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => values.set(key, value)),
        removeItem: vi.fn((key: string) => values.delete(key)),
      },
    });

    try {
      const browser = new BrowserLocalStorageTokenStore('global-tokens');
      browser.write({ accessToken: 'global' });
      expect(browser.read()).toEqual({ accessToken: 'global' });
      browser.clear();
      expect(values.has('global-tokens')).toBe(false);

      const defaultBrowser = new BrowserLocalStorageTokenStore();
      defaultBrowser.write({ accessToken: 'default-key' });
      expect(values.get('stynx.auth.tokens')).toBe(JSON.stringify({ accessToken: 'default-key' }));
      defaultBrowser.clear();
      expect(values.has('stynx.auth.tokens')).toBe(false);
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        Reflect.deleteProperty(globalThis, 'localStorage');
      }
    }
  });

  it('falls back to unavailable storage when global localStorage is absent', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Reflect.deleteProperty(globalThis, 'localStorage');

    try {
      const browser = new BrowserLocalStorageTokenStore();
      expect(browser.read()).toBe(null);
      expect(() => browser.write({ accessToken: 'ignored' })).not.toThrow();
      expect(() => browser.clear()).not.toThrow();
    } finally {
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      }
    }
  });

  it('evaluates frontend authorization helpers case-insensitively', () => {
    const principal = {
      sub: 'user',
      roles: ['Admin'],
      permissions: ['Records:Read', 'records:write'],
      tenantIds: [],
    };

    expect(hasAnyRole(null, ['admin'])).toBe(false);
    expect(hasAnyRole(principal, ['viewer', ' admin '])).toBe(true);
    expect(hasAnyPermission(null, ['records:read'])).toBe(false);
    expect(hasAnyPermission(principal, ['missing', 'records:read'])).toBe(true);
    expect(hasAllPermissions(null, ['records:read'])).toBe(false);
    expect(hasAllPermissions(principal, ['records:read', 'RECORDS:WRITE'])).toBe(true);
    expect(hasAllPermissions(principal, ['records:read', 'missing'])).toBe(false);
    expect(hasAnyRole(principal, [' admin '])).toBe(true);
    expect(hasAnyRole(principal, ['viewer'])).toBe(false);
    expect(hasAllPermissions(principal, [' records:read ', 'records:write'])).toBe(true);
  });

  it('builds Cognito URLs and parses JWT payloads', () => {
    const url = new URL(buildCognitoHostedUiLoginUrl({
      domain: 'https://auth.example.test/',
      clientId: 'client-1',
      redirectUri: 'https://app.example.test/callback',
      responseType: 'code',
      scopes: ['openid', 'custom'],
      identityProvider: 'Google',
    }));
    expect(url.origin).toBe('https://auth.example.test');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('client_id')).toBe('client-1');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid custom');
    expect(url.searchParams.get('identity_provider')).toBe('Google');

    expect(buildCognitoHostedUiLoginUrl({
      domain: 'auth.example.test',
      clientId: 'client-2',
      redirectUri: 'https://app.example.test/callback',
    })).toContain('response_type=token');

    // WAVE-05A Turn B.3a: trimProtocol regex kills.
    // /^https?:\/\//i — strips http:// or https:// from front. Mutations:
    //   /https?:\/\//i (no ^ anchor) → would strip mid-URL occurrences
    //   /^https:\/\//i (no `?` modifier) → would not strip 'http://'
    // The trailing /\/+$/ strips trailing slashes; mutation /\/+/ (no $)
    // strips first slash run anywhere.
    const fromHttp = buildCognitoHostedUiLoginUrl({
      domain: 'http://auth.example.test',
      clientId: 'c',
      redirectUri: 'https://app.example.test/cb',
    });
    expect(fromHttp).toMatch(/^https:\/\/auth\.example\.test\/login\?/u);

    const fromBare = buildCognitoHostedUiLoginUrl({
      domain: 'auth.example.test/',
      clientId: 'c',
      redirectUri: 'https://app.example.test/cb',
    });
    expect(fromBare).toMatch(/^https:\/\/auth\.example\.test\/login\?/u);

    const fromMulti = buildCognitoHostedUiLoginUrl({
      domain: 'https://auth.example.test///',
      clientId: 'c',
      redirectUri: 'https://app.example.test/cb',
    });
    // Trailing slashes all stripped, exactly one `/` between origin and `login`.
    expect(fromMulti).toMatch(/^https:\/\/auth\.example\.test\/login\?/u);
    expect(fromMulti.includes('test//')).toBe(false);

    // Default scopes when not provided (kills ArrayDeclaration + StringLiteral on the ['openid','email','profile'] default).
    const defaultScopes = buildCognitoHostedUiLoginUrl({
      domain: 'auth.example.test',
      clientId: 'c',
      redirectUri: 'https://app.example.test/cb',
    });
    const defaultScopeParam = new URL(defaultScopes).searchParams.get('scope');
    expect(defaultScopeParam).toBe('openid email profile');
    expect(parseJwtPayload(token({ sub: 'user' }))).toEqual({ sub: 'user' });
    const twoPartPayload = Buffer.from(JSON.stringify({ sub: 'two-part' }), 'utf8').toString('base64url');
    expect(parseJwtPayload(`h.${twoPartPayload}`)).toEqual({ sub: 'two-part' });
    expect(parseJwtPayload('missing-payload')).toBe(null);
    expect(parseJwtPayload('a.not-json.s')).toBe(null);

    const originalAtob = globalThis.atob;
    Object.defineProperty(globalThis, 'atob', {
      configurable: true,
      value: vi.fn(() => '{"via":"custom"}'),
    });
    expect(parseJwtPayload('h.not-base64.s')).toEqual({ via: 'custom' });
    expect(globalThis.atob).toHaveBeenCalledWith('not+base64==');

    Object.defineProperty(globalThis, 'atob', { configurable: true, value: undefined });
    try {
      expect(parseJwtPayload(token({ sub: 'user' }))).toBe(null);
    } finally {
      Object.defineProperty(globalThis, 'atob', { configurable: true, value: originalAtob });
    }
  });

  it('sends StynxApiClient requests with auth, tenant, body, query, and response variants', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const fetchFn: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.includes('/text')) return response(200, 'plain', { 'content-type': 'text/plain' });
      if (url.includes('/empty')) return response(200, '');
      return response(200, '{"ok":true}', { 'content-type': 'application/json' });
    };
    const sessionManager = {
      getValidAccessToken: vi.fn(() => 'token-1'),
    } as unknown as FrontendSessionManager;
    const client = new StynxApiClient({
      baseUrl: 'https://api.example.test/',
      fetchFn,
      sessionManager,
      tenantResolver: () => 'tenant-1',
      defaultHeaders: { 'x-source': 'sdk' },
    });

    await expect(client.get('/records', {
      query: { page: 1, skip: null, missing: undefined },
    })).resolves.toEqual({ ok: true });
    await expect(client.get('/records', {
      query: { skip: null, missing: undefined },
    })).resolves.toEqual({ ok: true });
    await expect(client.post('/records', { name: 'demo' }, {
      headers: {
        authorization: 'Bearer caller',
        'Content-Type': 'custom/type',
        'X-Tenant-Id': 'caller-tenant',
      },
      tenantId: null,
    })).resolves.toEqual({ ok: true });
    await expect(client.post('/records', { name: 'demo' })).resolves.toEqual({ ok: true });
    await expect(client.delete('/text')).resolves.toBe('plain');
    await expect(client.request('PATCH', '/empty')).resolves.toBe(undefined);

    expect(calls[0]?.url).toBe('https://api.example.test/records?page=1');
    expect(calls[1]?.url).toBe('https://api.example.test/records');
    expect(calls[0]?.init?.headers).toMatchObject({
      Authorization: 'Bearer token-1',
      'x-tenant-id': 'tenant-1',
      'x-source': 'sdk',
    });
    expect(calls[2]?.init?.headers).toMatchObject({
      authorization: 'Bearer caller',
      'Content-Type': 'custom/type',
      'X-Tenant-Id': 'caller-tenant',
    });
    expect(calls[2]?.init?.headers?.['x-tenant-id']).toBe(undefined);
    expect(calls[3]?.init?.headers?.['content-type']).toBe('application/json');
  });

  it('normalizes StynxApiClient base paths, query primitives, and header precedence exactly', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const sessionManager = {
      getValidAccessToken: vi.fn(() => ''),
    } as unknown as FrontendSessionManager;
    const client = new StynxApiClient({
      baseUrl: 'https://api.example.test/root///',
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return response(200, '{"ok":true}', { 'Content-Type': 'Application/JSON; charset=utf-8' });
      },
      sessionManager,
      tenantResolver: () => '',
      defaultHeaders: { Authorization: 'Bearer default-token' },
    });

    await client.request('PUT', '///records', { ok: true }, {
      query: { zero: 0, enabled: false, text: 'a b' },
      headers: { authorization: 'Bearer caller-token' },
    });
    await client.request('GET', '/', undefined, { query: {} });

    expect(calls[0]?.url).toBe('https://api.example.test/root/records?zero=0&enabled=false&text=a+b');
    expect(calls[0]?.init).toEqual({
      method: 'PUT',
      headers: {
        Authorization: 'Bearer default-token',
        authorization: 'Bearer caller-token',
        'content-type': 'application/json',
      },
      signal: undefined,
      body: JSON.stringify({ ok: true }),
    });
    expect(calls[1]?.url).toBe('https://api.example.test/root/');
    expect(calls[1]?.init?.headers).toEqual({ Authorization: 'Bearer default-token' });
  });

  it('keeps StynxApiClient methods, empty query, auth, and content-type decisions observable', async () => {
    const calls: Array<{ url: string; init?: HttpRequestInitLike }> = [];
    const client = new StynxApiClient({
      baseUrl: 'https://api.example.test///',
      fetchFn: async (url, init) => {
        calls.push({ url, init });
        return response(200, '{"ok":true}', { 'content-type': 'application/json' });
      },
      sessionManager: {
        getValidAccessToken: vi.fn(() => ''),
      } as unknown as FrontendSessionManager,
      tenantResolver: () => null,
    });
    const request = vi.spyOn(client, 'request');

    await client.get('nested///records');
    await client.post('///records', { ok: true }, { headers: { 'Content-Type': 'application/custom' } });
    await client.delete('/records/1');

    expect(request.mock.calls).toEqual([
      ['GET', 'nested///records', undefined, undefined],
      ['POST', '///records', { ok: true }, { headers: { 'Content-Type': 'application/custom' } }],
      ['DELETE', '/records/1', undefined, undefined],
    ]);
    expect(calls[0]?.url).toBe('https://api.example.test/nested///records');
    expect(calls[0]?.init?.headers).toEqual({});
    expect(Object.hasOwn(calls[0]!.init!, 'body')).toBe(false);
    expect(calls[1]?.url).toBe('https://api.example.test/records');
    expect(calls[1]?.init?.headers).toEqual({ 'Content-Type': 'application/custom' });
    expect(calls[2]?.init?.method).toBe('DELETE');
  });

  it('surfaces StynxApiClient error responses', async () => {
    const client = new StynxApiClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(503, 'down'),
    });

    await expect(client.get('/down')).rejects.toMatchObject({
      status: 503,
      body: 'down',
      message: 'Request failed (503)',
    } satisfies Partial<ApiClientError>);
  });

  it('surfaces malformed JSON success bodies instead of hiding parser failures', async () => {
    const client = new StynxApiClient({
      baseUrl: 'https://api.example.test',
      fetchFn: async () => response(200, '{"broken"', { 'content-type': 'application/json' }),
    });

    await expect(client.get('/malformed')).rejects.toBeInstanceOf(SyntaxError);
  });
});
