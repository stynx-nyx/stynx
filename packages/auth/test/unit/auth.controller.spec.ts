import { StynxAuthController } from '../../src/auth.controller';

describe('StynxAuthController', () => {
  const authService = {
    exchangeCognitoToken: vi.fn(),
    switchTenant: vi.fn(),
    logout: vi.fn(),
    inspectPermissions: vi.fn(),
    invalidatePermissions: vi.fn(),
  };

  const controller = new StynxAuthController(authService as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session from the tenant header and token body', async () => {
    authService.exchangeCognitoToken.mockResolvedValue({ accessToken: 'token' });

    await expect(
      controller.createSession(
        {
          cognitoToken: 'cognito-token',
          deviceMeta: { ua: 'spec' },
        },
        'tenant-1',
      ),
    ).resolves.toEqual({ accessToken: 'token' });

    expect(authService.exchangeCognitoToken).toHaveBeenCalledWith(
      'cognito-token',
      'tenant-1',
      { ua: 'spec' },
    );
  });

  it('defaults session device metadata when the body omits it', async () => {
    authService.exchangeCognitoToken.mockResolvedValue({ accessToken: 'token' });

    await controller.createSession({ cognitoToken: 'cognito-token' }, 'tenant-1');

    expect(authService.exchangeCognitoToken).toHaveBeenCalledWith(
      'cognito-token',
      'tenant-1',
      {},
    );
  });

  it('rejects session creation without a tenant header', async () => {
    await expect(
      controller.createSession({ cognitoToken: 'token' }, undefined),
    ).rejects.toMatchObject({
      message: 'TENANT_ACCESS_DENIED',
    });
  });

  it('rejects session creation without a cognito token', async () => {
    await expect(
      controller.createSession({}, 'tenant-1'),
    ).rejects.toMatchObject({
      message: 'Missing Cognito bearer token',
    });
  });

  it('switches tenant using the request claims and optional cognito subject', async () => {
    authService.switchTenant.mockResolvedValue({ accessToken: 'next-token' });

    const request = {
      stynxClaims: {
        sid: 'sid-1',
        sub: 'user-1',
        cognitoSub: 'cognito-1',
        tenantId: 'tenant-1',
        claims: {},
      },
    };

    await expect(
      controller.switchSession(request as never, { deviceMeta: { device: 'browser' } }, 'tenant-2'),
    ).resolves.toEqual({ accessToken: 'next-token' });

    expect(authService.switchTenant).toHaveBeenCalledWith(
      {
        sid: 'sid-1',
        sub: 'user-1',
        cognitoSub: 'cognito-1',
      },
      'tenant-2',
      { device: 'browser' },
    );
  });

  it('prefers the body tenant id when switching sessions', async () => {
    authService.switchTenant.mockResolvedValue({ accessToken: 'next-token' });

    await controller.switchSession(
      {
        stynxClaims: {
          sid: 'sid-1',
          sub: 'user-1',
          tenantId: 'tenant-1',
          claims: {},
        },
      } as never,
      { tenantId: 'tenant-body' },
      'tenant-header',
    );

    expect(authService.switchTenant).toHaveBeenCalledWith(
      {
        sid: 'sid-1',
        sub: 'user-1',
      },
      'tenant-body',
      {},
    );
    expect(Object.prototype.hasOwnProperty.call(authService.switchTenant.mock.calls[0]?.[0], 'cognitoSub')).toBe(false);
  });

  it('rejects session switching without request claims or tenant', async () => {
    await expect(
      controller.switchSession({} as never, {}, undefined),
    ).rejects.toMatchObject({
      message: 'TENANT_ACCESS_DENIED',
    });
  });

  it('logs out the current session and returns ok', async () => {
    authService.logout.mockResolvedValue(undefined);

    await expect(
      controller.logout({
        stynxClaims: {
          sid: 'sid-1',
          sub: 'user-1',
          tenantId: 'tenant-1',
          claims: {},
        },
      } as never),
    ).resolves.toEqual({ status: 'ok' });

    expect(authService.logout).toHaveBeenCalledWith('sid-1');
  });

  it('rejects logout without a session claim', async () => {
    await expect(controller.logout({} as never)).rejects.toMatchObject({
      message: 'Missing STYNX access token',
    });
  });

  it('delegates inspect and invalidate actions', async () => {
    authService.inspectPermissions.mockReturnValue({ permissions: ['read'] });
    authService.invalidatePermissions.mockResolvedValue(undefined);

    expect(controller.inspect('sid-1')).toEqual({ permissions: ['read'] });

    await expect(controller.invalidate('sid-1')).resolves.toEqual({ status: 'ok' });
    expect(authService.invalidatePermissions).toHaveBeenCalledWith('sid-1');
  });
});
