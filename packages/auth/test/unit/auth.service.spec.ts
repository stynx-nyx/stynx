import type { ModuleRef } from '@nestjs/core';
import type { SessionBundle } from '@stynx-nyx/sessions';
import { RequestContext, RequestContextMutator } from '@stynx-nyx/core';
import { StynxAuthService } from '../../src/auth.service';

describe('StynxAuthService', () => {
  const permissionCache = {
    prime: vi.fn(),
    invalidateSid: vi.fn(),
    inspectSid: vi.fn(),
  };
  const permissionQueries = {
    resolveForUser: vi.fn(),
  };
  const effectiveHashComputer = {
    ensureMembershipHash: vi.fn(),
  };
  const cognitoValidator = {
    validateAccessToken: vi.fn(),
  };

  const sessionBundle: SessionBundle = {
    sid: 'sid-1',
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };

  let moduleRef: ModuleRef;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createService(
    options: {
      userLookupRows?: Array<{ id: string; external_subject: string | null; email: string }>;
      requestContextActive?: boolean;
      withMutator?: boolean;
      withRequestContext?: boolean;
    } = {},
  ) {
    const txQuery = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('from auth.users')) {
        return Promise.resolve({ rows: options.userLookupRows ?? [] });
      }
      if (sql.includes('update auth.users')) {
        return Promise.resolve({ rows: [] });
      }
      if (sql.includes('insert into auth.users')) {
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    });
    const database = {
      tx: vi.fn(async (fn: (trx: { query: typeof txQuery }) => Promise<unknown>) =>
        fn({ query: txQuery }),
      ),
      withSystemContext: vi.fn((_reason: string, fn: () => Promise<unknown>) => fn()),
    };
    const sessionService = {
      create: vi.fn().mockResolvedValue(sessionBundle),
      revoke: vi.fn().mockResolvedValue(true),
    };
    const requestContext = {
      hasActiveContext: vi.fn().mockReturnValue(Boolean(options.requestContextActive)),
    } as unknown as RequestContext;
    const requestContextMutator = {
      patch: vi.fn(),
      runWithRequestContext: vi.fn((_context, fn: () => Promise<unknown>) => fn()),
    } as unknown as RequestContextMutator;

    moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === RequestContext) {
          return options.withRequestContext === false ? undefined : requestContext;
        }
        if (token === RequestContextMutator) {
          return options.withMutator === false ? undefined : requestContextMutator;
        }
        if (typeof token === 'function' && token.name === 'Database') {
          return database;
        }
        if (typeof token === 'function' && token.name === 'SessionService') {
          return sessionService;
        }
        return undefined;
      }),
    } as unknown as ModuleRef;

    const service = new StynxAuthService(
      moduleRef,
      permissionCache as never,
      permissionQueries as never,
      effectiveHashComputer as never,
      cognitoValidator as never,
    );

    return { service, txQuery, database, sessionService, requestContextMutator };
  }

  it('exchanges a cognito token using an existing user and active request context', async () => {
    cognitoValidator.validateAccessToken.mockResolvedValue({
      sub: 'cognito-1',
      email: 'user@example.com',
      claims: {},
    });
    permissionQueries.resolveForUser.mockResolvedValue({
      membershipId: 'membership-1',
      permissions: ['document:read:*'],
      hash: 'hash-1',
      generation: 2,
    });
    const { service, txQuery, sessionService, requestContextMutator } = createService({
      userLookupRows: [{ id: 'user-1', external_subject: null, email: 'user@example.com' }],
      requestContextActive: true,
    });

    await expect(
      service.exchangeCognitoToken('token', 'tenant-1', { device: 'browser' }),
    ).resolves.toEqual(sessionBundle);

    expect(cognitoValidator.validateAccessToken).toHaveBeenCalledWith('token');
    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('from auth.users'), [
      'cognito-1',
      'user@example.com',
    ]);
    expect(effectiveHashComputer.ensureMembershipHash).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(permissionQueries.resolveForUser).toHaveBeenCalledWith('user-1', 'tenant-1');
    expect(sessionService.create).toHaveBeenCalledWith(
      'user-1',
      'tenant-1',
      'cognito-1',
      { device: 'browser' },
      { membershipId: 'membership-1', permsHash: 'hash-1' },
    );
    expect(permissionCache.prime).toHaveBeenCalledTimes(1);
    expect(requestContextMutator.patch).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      actorId: 'user-1',
    });
  });

  it('creates a user when cognito subject is unseen and there is no active request context', async () => {
    cognitoValidator.validateAccessToken.mockResolvedValue({
      sub: 'cognito-2',
      claims: {},
    });
    permissionQueries.resolveForUser.mockResolvedValue({
      membershipId: 'membership-2',
      permissions: ['document:read:*'],
      hash: 'hash-2',
      generation: 3,
    });
    const { service, txQuery, requestContextMutator } = createService({
      userLookupRows: [],
      requestContextActive: false,
    });

    await service.exchangeCognitoToken('token', 'tenant-2');

    expect(txQuery).toHaveBeenCalledWith(
      expect.stringContaining('insert into auth.users'),
      expect.arrayContaining(['cognito-2@stynx.local', 'cognito-2']),
    );
    expect(requestContextMutator.runWithRequestContext).toHaveBeenCalledTimes(2);
  });

  it('creates a request context when only the mutator provider is available', async () => {
    cognitoValidator.validateAccessToken.mockResolvedValue({
      sub: 'cognito-6',
      email: 'user6@example.com',
      claims: {},
    });
    permissionQueries.resolveForUser.mockResolvedValue({
      membershipId: 'membership-6',
      permissions: ['document:read:*'],
      hash: 'hash-6',
      generation: 6,
    });
    const { service, requestContextMutator } = createService({
      userLookupRows: [{ id: 'user-6', external_subject: 'cognito-6', email: 'user6@example.com' }],
      withRequestContext: false,
    });

    await expect(service.exchangeCognitoToken('token', 'tenant-6')).resolves.toEqual(sessionBundle);

    expect(requestContextMutator.patch).not.toHaveBeenCalledTimes(1);
    expect(requestContextMutator.runWithRequestContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-6', actorId: 'user-6' }),
      expect.any(Function),
    );
  });

  it('reuses the current email when an existing user is found and cognito omits email', async () => {
    cognitoValidator.validateAccessToken.mockResolvedValue({
      sub: 'cognito-4',
      claims: {},
    });
    permissionQueries.resolveForUser.mockResolvedValue({
      membershipId: 'membership-4',
      permissions: ['document:read:*'],
      hash: 'hash-4',
      generation: 5,
    });
    const { service, txQuery } = createService({
      userLookupRows: [{ id: 'user-4', external_subject: 'cognito-4', email: 'user4@example.com' }],
    });

    await service.exchangeCognitoToken('token', 'tenant-4');

    expect(txQuery).toHaveBeenCalledWith(expect.stringContaining('update auth.users'), [
      'user-4',
      'cognito-4',
      'user4@example.com',
    ]);
  });

  it('switches tenant, revokes the old session, and invalidates the old sid', async () => {
    permissionQueries.resolveForUser.mockResolvedValue({
      membershipId: 'membership-3',
      permissions: ['document:read:*'],
      hash: 'hash-3',
      generation: 4,
    });
    const { service, sessionService } = createService({
      userLookupRows: [{ id: 'user-3', external_subject: 'cognito-3', email: 'user3@example.com' }],
    });

    await expect(
      service.switchTenant({ sid: 'sid-old', sub: 'user-3', cognitoSub: 'cognito-3' }, 'tenant-3', {
        browser: true,
      }),
    ).resolves.toEqual(sessionBundle);

    expect(sessionService.create).toHaveBeenCalledWith(
      'user-3',
      'tenant-3',
      'cognito-3',
      { browser: true },
      { membershipId: 'membership-3', permsHash: 'hash-3' },
    );
    expect(sessionService.revoke).toHaveBeenCalledWith('sid-old');
    expect(permissionCache.invalidateSid).toHaveBeenCalledWith('sid-old');
  });

  it('uses the stynx subject when switching without a cognito subject', async () => {
    permissionQueries.resolveForUser.mockResolvedValue({
      membershipId: 'membership-local',
      permissions: ['document:read:*'],
      hash: 'hash-local',
      generation: 4,
    });
    const { service, sessionService } = createService();

    await service.switchTenant({ sid: 'sid-old', sub: 'user-local' }, 'tenant-local');

    expect(sessionService.create).toHaveBeenCalledWith(
      'user-local',
      'tenant-local',
      'user-local',
      {},
      { membershipId: 'membership-local', permsHash: 'hash-local' },
    );
  });

  it('logs out, inspects, and invalidates permissions through the cache', async () => {
    const { service, sessionService } = createService();
    permissionCache.inspectSid.mockResolvedValue({ sid: 'sid-1' });

    await service.logout('sid-1');
    expect(sessionService.revoke).toHaveBeenCalledWith('sid-1');
    expect(permissionCache.invalidateSid).toHaveBeenCalledWith('sid-1');

    await expect(service.inspectPermissions('sid-1')).resolves.toEqual({ sid: 'sid-1' });
    await expect(service.invalidatePermissions('sid-2')).resolves.toBe(undefined);
    expect(permissionCache.invalidateSid).toHaveBeenCalledWith('sid-2');
  });

  it('fails clearly when the database or session service provider is unavailable', async () => {
    moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === RequestContext) {
          return { hasActiveContext: () => false };
        }
        if (token === RequestContextMutator) {
          return undefined;
        }
        return undefined;
      }),
    } as unknown as ModuleRef;

    const service = new StynxAuthService(
      moduleRef,
      permissionCache as never,
      permissionQueries as never,
      effectiveHashComputer as never,
      cognitoValidator as never,
    );

    await expect(service.exchangeExistingIdentity('user-1', undefined, 'tenant-1')).rejects.toThrow(
      'SessionService provider is unavailable to StynxAuthService',
    );
  });

  it('fails clearly when the database provider is unavailable during cognito exchange', async () => {
    cognitoValidator.validateAccessToken.mockResolvedValue({
      sub: 'cognito-5',
      email: 'user5@example.com',
      claims: {},
    });
    moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === RequestContext) {
          return { hasActiveContext: () => false };
        }
        if (token === RequestContextMutator) {
          return undefined;
        }
        if (typeof token === 'function' && token.name === 'SessionService') {
          return {
            create: vi.fn().mockResolvedValue(sessionBundle),
            revoke: vi.fn().mockResolvedValue(true),
          };
        }
        return undefined;
      }),
    } as unknown as ModuleRef;

    const service = new StynxAuthService(
      moduleRef,
      permissionCache as never,
      permissionQueries as never,
      effectiveHashComputer as never,
      cognitoValidator as never,
    );

    await expect(service.exchangeCognitoToken('token', 'tenant-5')).rejects.toThrow(
      'Database provider is unavailable to StynxAuthService',
    );
  });
});
