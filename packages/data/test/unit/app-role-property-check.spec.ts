import { RequestContext, SystemContext } from '@stynx-nyx/core';
import { ClsService } from 'nestjs-cls';
import type { PoolClient } from 'pg';
import { AppRoleVerifier, DEFAULT_APP_ROLE_NAME, resolveAppRoleName } from '../../src/app-role';
import { Database } from '../../src/database';
import { AppRoleConfigurationError, TransactionIdentityMismatchError } from '../../src/errors';
import { StynxPoolRegistry } from '../../src/pools';
import type { StynxDataModuleOptions } from '../../src/tokens';

// INV-RBAC-001; UPS-OBX-10 (ADR-OUTBOX-0003 D1 items 1, 3 and 7): the
// application SQL role is configuration, validated once, and its properties
// are proven on an application connection before the pool serves a transaction.
interface LiveRole {
  current_user: string;
  session_user: string;
  current_super: boolean;
  current_bypassrls: boolean;
  session_super: boolean;
  session_bypassrls: boolean;
}

const conforming: LiveRole = {
  current_user: 'stynx_app',
  session_user: 'stynx_app',
  current_super: false,
  current_bypassrls: false,
  session_super: false,
  session_bypassrls: false,
};

function fakePool(rows: Array<LiveRole | Error>) {
  const queries: string[] = [];
  const release = vi.fn();
  const connect = vi.fn(async () => {
    const next = rows.shift();
    if (next instanceof Error && next.message === 'connect') throw next;
    return {
      query: vi.fn(async (sql: string) => {
        queries.push(sql);
        if (next instanceof Error) throw next;
        return { rows: next ? [next] : [] };
      }),
      release,
    };
  });
  return { pool: { connect, end: vi.fn(async () => undefined) }, connect, release, queries };
}

describe('resolveAppRoleName', () => {
  it('defaults to stynx_app and honours a custom identifier', () => {
    expect(DEFAULT_APP_ROLE_NAME).toBe('stynx_app');
    expect(resolveAppRoleName({})).toBe('stynx_app');
    expect(resolveAppRoleName({ appRoleName: 'role_app_backend' })).toBe('role_app_backend');
    expect(resolveAppRoleName({ appRoleName: `_${'x'.repeat(62)}` })).toHaveLength(63);
  });

  it.each([
    ['empty', ''],
    ['whitespace', ' stynx_app'],
    ['hyphen', 'role-app'],
    ['leading digit', '1role'],
    ['64 bytes', 'r'.repeat(64)],
    ['63 characters over 63 bytes', 'é'.repeat(40)],
    ['SQL fragment', "stynx_app' or '1'='1"],
    ['not a string', 42 as unknown as string],
  ])('rejects %s at construction with a typed appRoleName error', (_label, appRoleName) => {
    let failure: unknown;
    try {
      resolveAppRoleName({ appRoleName });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AppRoleConfigurationError);
    expect(failure).toMatchObject({
      code: 'APP_ROLE_CONFIGURATION',
      status: 500,
      property: 'appRoleName',
      context: { property: 'appRoleName' },
    });
    expect((failure as Error).message).toContain('appRoleName');
  });
});

describe('AppRoleVerifier', () => {
  it('passes a conforming role on one connection and latches', async () => {
    const { pool, connect, release, queries } = fakePool([conforming]);
    const verifier = new AppRoleVerifier(() => pool as never, 'stynx_app');
    expect(verifier.isVerified).toBe(false);
    await Promise.all([verifier.ensure(), verifier.ensure()]);
    await verifier.ensure();
    expect(verifier.isVerified).toBe(true);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/current_user/u);
    expect(queries[0]).toMatch(/session_user/u);
    expect(queries[0]).toMatch(/pg_roles|pg_catalog/u);
    expect(queries[0]).not.toContain('stynx_app');
  });

  it('accepts a conforming login role behind SET ROLE', async () => {
    const { pool } = fakePool([{ ...conforming, session_user: 'login_role' }]);
    await expect(new AppRoleVerifier(() => pool as never, 'stynx_app').ensure()).resolves.toBe(
      undefined,
    );
  });

  it.each([
    ['current_user', { ...conforming, current_user: 'stynx_owner' }, 'stynx_app'],
    ['current_user', { ...conforming, current_user: 'stynx_app' }, 'role_app_backend'],
    ['rolsuper', { ...conforming, current_super: true }, 'stynx_app'],
    ['rolbypassrls', { ...conforming, current_bypassrls: true }, 'stynx_app'],
    [
      'session_user.rolsuper',
      { ...conforming, session_user: 'postgres', session_super: true },
      'stynx_app',
    ],
    [
      'session_user.rolbypassrls',
      { ...conforming, session_user: 'stynx_owner', session_bypassrls: true },
      'stynx_app',
    ],
  ] as const)(
    'refuses %s with a typed error naming the property',
    async (property, live, roleName) => {
      const { pool, release } = fakePool([live]);
      const verifier = new AppRoleVerifier(() => pool as never, roleName);
      let failure: unknown;
      try {
        await verifier.ensure();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(AppRoleConfigurationError);
      expect(failure).toMatchObject({
        code: 'APP_ROLE_CONFIGURATION',
        property,
        context: { property, role: roleName },
      });
      expect(JSON.stringify(failure)).not.toMatch(/password|secret/iu);
      expect(release).toHaveBeenCalledTimes(1);
      expect(verifier.isVerified).toBe(false);
    },
  );

  it('ignores a privileged session_user only when it is the current_user itself', async () => {
    const { pool } = fakePool([{ ...conforming, session_super: true, session_bypassrls: true }]);
    await expect(new AppRoleVerifier(() => pool as never, 'stynx_app').ensure()).resolves.toBe(
      undefined,
    );
  });

  it('refuses an empty catalog answer as a current_user failure', async () => {
    const { pool } = fakePool([]);
    await expect(
      new AppRoleVerifier(() => pool as never, 'stynx_app').ensure(),
    ).rejects.toMatchObject({ property: 'current_user' });
  });

  it('re-runs after a failure until the check passes', async () => {
    const { pool, connect } = fakePool([
      new Error('connect'),
      { ...conforming, current_super: true },
      conforming,
    ]);
    const verifier = new AppRoleVerifier(() => pool as never, 'stynx_app');
    await expect(verifier.ensure()).rejects.toThrow('connect');
    await expect(verifier.ensure()).rejects.toBeInstanceOf(AppRoleConfigurationError);
    await expect(verifier.ensure()).resolves.toBe(undefined);
    await expect(verifier.ensure()).resolves.toBe(undefined);
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it('prime() defers an unreachable database and rethrows a property failure', async () => {
    const unreachable = fakePool([new Error('connect'), conforming]);
    const verifier = new AppRoleVerifier(() => unreachable.pool as never, 'stynx_app');
    await expect(verifier.prime()).resolves.toBe(undefined);
    expect(verifier.isVerified).toBe(false);
    await expect(verifier.ensure()).resolves.toBe(undefined);
    expect(verifier.isVerified).toBe(true);

    const privileged = fakePool([{ ...conforming, current_super: true }]);
    await expect(
      new AppRoleVerifier(() => privileged.pool as never, 'stynx_app').prime(),
    ).rejects.toBeInstanceOf(AppRoleConfigurationError);
  });
});

describe('StynxPoolRegistry app-role latch', () => {
  const connections = {
    owner: { connectionString: 'postgresql://owner@127.0.0.1:1/db' },
    app: { connectionString: 'postgresql://app@127.0.0.1:1/db' },
    reader: { connectionString: 'postgresql://reader@127.0.0.1:1/db' },
  };

  it('validates the role name at construction and exposes it', () => {
    expect(
      new StynxPoolRegistry({ connections, appRoleName: 'role_app_backend' }, {} as never)
        .appRoleName,
    ).toBe('role_app_backend');
    expect(new StynxPoolRegistry({ connections }, {} as never).appRoleName).toBe('stynx_app');
    expect(() => new StynxPoolRegistry({ connections, appRoleName: '' }, {} as never)).toThrow(
      AppRoleConfigurationError,
    );
  });

  it('primes the check at app pool creation and keeps failing typed until it passes', async () => {
    const registry = new StynxPoolRegistry({ connections }, {} as never);
    await registry.onModuleInit();
    await expect(registry.ensureAppRole()).rejects.toThrow();
    const { pool, connect } = fakePool([conforming]);
    registry.pools.app = pool as never;
    await expect(registry.ensureAppRole()).resolves.toBe(undefined);
    await expect(registry.ensureAppRole()).resolves.toBe(undefined);
    expect(connect).toHaveBeenCalledTimes(1);
    await registry.onModuleDestroy();
  });

  it('builds the latch lazily when the pool was created without init', async () => {
    const registry = new StynxPoolRegistry({ connections }, {} as never);
    const { pool, connect } = fakePool([conforming]);
    registry.pools.app = pool as never;
    await expect(registry.ensureAppRole()).resolves.toBe(undefined);
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe('Database app-role gate', () => {
  const TENANT = '018f53e4-28a1-7cd8-a0ff-5b22c3a07111';
  const ACTOR = '018f53e4-28a1-7cd8-a0ff-5b22c3a07112';
  const options: StynxDataModuleOptions = {
    connections: {
      owner: { connectionString: 'postgres://owner' },
      app: { connectionString: 'postgres://app' },
      reader: { connectionString: 'postgres://reader' },
    },
  };

  function harness(ensureAppRole: () => Promise<void>, moduleOptions = options) {
    const statements: string[] = [];
    let active: unknown;
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (/current_user|current_setting/u.test(sql)) {
          return {
            rows: [{ current_user: 'stynx_app', role: 'app', tenant_id: TENANT, actor_id: ACTOR }],
          };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PoolClient;
    const connect = vi.fn(async () => client);
    const requestContext = {
      hasActiveContext: () => true,
      snapshot: () => ({
        requestId: 'req',
        tenantId: TENANT,
        actorId: ACTOR,
        startedAt: new Date(),
      }),
    } as RequestContext;
    const systemContext = {
      current: () => ({ requestId: 'system', actorId: ACTOR }),
      withSystemContext: async <T>(_reason: string, fn: () => Promise<T>) => fn(),
    } as SystemContext;
    const cls = {
      get: vi.fn(() => active),
      set: vi.fn((_key: PropertyKey, value: unknown) => {
        active = value;
      }),
    } as unknown as ClsService<Record<PropertyKey, unknown>>;
    const ensure = vi.fn(ensureAppRole);
    const pools = {
      get: vi.fn(() => ({ connect })),
      ensureAppRole: ensure,
    } as unknown as StynxPoolRegistry;
    return {
      database: new Database(requestContext, systemContext, pools, cls, moduleOptions),
      connect,
      ensure,
      statements,
    };
  }

  it('exposes the resolved role name read-only', () => {
    const { database } = harness(async () => undefined);
    expect(database.appRoleName).toBe('stynx_app');
    expect(
      harness(async () => undefined, { ...options, appRoleName: 'role_app_backend' }).database
        .appRoleName,
    ).toBe('role_app_backend');
    expect(() => harness(async () => undefined, { ...options, appRoleName: 'bad name' })).toThrow(
      AppRoleConfigurationError,
    );
    expect(
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(database), 'appRoleName')?.set,
    ).toBe(undefined);
  });

  it('waits for the latch before acquiring an app connection and refuses typed on failure', async () => {
    const failure = new AppRoleConfigurationError('rolsuper', { role: 'stynx_app' });
    const { database, connect, ensure } = harness(async () => {
      throw failure;
    });
    const caller = vi.fn(async () => 'unreached');
    await expect(database.tx(caller, { retry: false })).rejects.toBe(failure);
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(connect).not.toHaveBeenCalled();
    expect(caller).not.toHaveBeenCalled();
  });

  it('runs the latch once per top-level app transaction and never for owner or reader', async () => {
    const { database, connect, ensure } = harness(async () => undefined);
    await expect(database.tx(async () => 'ok', { retry: false })).resolves.toBe('ok');
    await expect(database.txIndependent(async () => 'ok', { retry: false })).resolves.toBe('ok');
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenCalledTimes(2);
    await database.tx(async () => undefined, { role: 'owner', retry: false });
    await database.tx(async () => undefined, { role: 'reader', readonly: true, retry: false });
    await database.withReplica(async () => undefined);
    expect(ensure).toHaveBeenCalledTimes(2);
  });
});

describe('TransactionIdentityMismatchError typed reason', () => {
  it('keeps the untyped shape and carries the typed mismatch in context additively', () => {
    const bare = new TransactionIdentityMismatchError();
    expect(bare).toMatchObject({ code: 'TRANSACTION_IDENTITY_MISMATCH', status: 500 });
    expect(bare.context).toBe(undefined);
    expect(bare.mismatch).toBe(undefined);
    const legacy = new TransactionIdentityMismatchError({ reason: 'live app identity mismatch' });
    expect(legacy.context).toEqual({ reason: 'live app identity mismatch' });
    expect(legacy.mismatch).toBe(undefined);
    const typed = new TransactionIdentityMismatchError(
      { reason: 'live app identity mismatch' },
      'sql_role',
    );
    expect(typed.context).toEqual({ reason: 'live app identity mismatch', mismatch: 'sql_role' });
    expect(typed.mismatch).toBe('sql_role');
    expect(typed.message).toBe(bare.message);
  });
});
