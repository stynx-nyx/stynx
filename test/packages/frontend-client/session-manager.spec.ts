import { FrontendSessionManager, InMemoryTokenStore } from '@stynx-web/sdk';

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

describe('FrontendSessionManager', () => {
  it('hydrates principal from token claims', () => {
    const store = new InMemoryTokenStore();
    const manager = new FrontendSessionManager(store);
    const accessToken = buildJwt({
      sub: 'user-1',
      email: 'user@example.test',
      roles: ['platform:admin'],
      permissions: ['storage:read'],
      tenant_id: 'tenant-a',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    manager.setTokens({ accessToken });
    const state = manager.hydrate();

    expect(state.principal?.sub).toBe('user-1');
    expect(state.principal?.roles).toEqual(['platform:admin']);
    expect(state.principal?.permissions).toEqual(['storage:read']);
    expect(state.principal?.tenantId).toBe('tenant-a');
    expect(manager.getValidAccessToken()).toBe(accessToken);
  });

  it('clears expired token on hydrate', () => {
    const store = new InMemoryTokenStore();
    const manager = new FrontendSessionManager(store);
    const accessToken = buildJwt({
      sub: 'user-expired',
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    manager.setTokens({ accessToken });
    const state = manager.hydrate();

    expect(state.tokens).toBeNull();
    expect(state.principal).toBeNull();
    expect(store.read()).toBeNull();
  });

  it('splits whitespace permissions from scope claims', () => {
    const store = new InMemoryTokenStore();
    const manager = new FrontendSessionManager(store);
    const accessToken = buildJwt({
      sub: 'user-scope',
      scope: 'docs:read docs:write',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    manager.setTokens({ accessToken });
    const state = manager.hydrate();

    expect(state.principal?.permissions).toEqual(['docs:read', 'docs:write']);
  });
});
