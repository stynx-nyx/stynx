import { RequestContext, SystemContext } from '@stynx-nyx/core';
import { ClsService } from 'nestjs-cls';
import type { PoolClient } from 'pg';
import { Database } from '../../src/database';
import type { StynxPoolRegistry } from '../../src/pools';
import type { StynxDataModuleOptions } from '../../src/tokens';
import type { TxOptions } from '../../src/types';

// INV-RBAC-001: command transactions require the live app identity, including when nested.
const TENANT = '018f53e4-28a1-7cd8-a0ff-5b22c3a07111';
const ACTOR = '018f53e4-28a1-7cd8-a0ff-5b22c3a07112';
const command = { role: 'app', requireActor: true, retry: false } as TxOptions;
const options: StynxDataModuleOptions = {
  connections: {
    owner: { connectionString: 'postgres://owner' },
    app: { connectionString: 'postgres://app' },
    reader: { connectionString: 'postgres://reader' },
  },
};

function harness(live: { user: string; role: string; tenant: string; actor: string }) {
  const statements: string[] = [];
  let active: unknown;
  const client = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql);
      if (/current_user|current_setting/u.test(sql)) {
        return { rows: [{ current_user: live.user, role: live.role, tenant_id: live.tenant, actor_id: live.actor }] };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  } as unknown as PoolClient;
  const requestContext = {
    hasActiveContext: () => true,
    snapshot: () => ({ requestId: 'req', tenantId: TENANT, actorId: ACTOR, startedAt: new Date() }),
  } as RequestContext;
  const systemContext = {
    current: () => ({ requestId: 'system', actorId: ACTOR }),
    withSystemContext: async <T>(_reason: string, fn: () => Promise<T>) => fn(),
  } as SystemContext;
  const cls = {
    get: vi.fn(() => active),
    set: vi.fn((_key: PropertyKey, value: unknown) => { active = value; }),
  } as unknown as ClsService<Record<PropertyKey, unknown>>;
  const pools = { get: vi.fn(() => ({ connect: async () => client })) } as unknown as StynxPoolRegistry;
  return { database: new Database(requestContext, systemContext, pools, cls, options), statements, pools, client };
}

describe('Database.tx requireActor', () => {
  it.each(['owner', 'reader'] as const)('rejects %s command role before acquiring a connection', async (role) => {
    const { database, pools } = harness({ user: 'stynx_app', role: 'app', tenant: TENANT, actor: ACTOR });
    await expect(database.tx(async () => 'unreached', { role, readonly: role === 'reader', requireActor: true } as TxOptions)).rejects.toThrow();
    expect(pools.get).not.toHaveBeenCalled();
  });

  it('rejects a nested command on an owner connection before savepoint or caller SQL', async () => {
    const { database, statements } = harness({ user: 'stynx_owner', role: 'owner', tenant: TENANT, actor: ACTOR });
    const caller = vi.fn(async () => undefined);
    await database.tx(async () => {
      await expect(database.tx(caller, command)).rejects.toThrow();
    }, { role: 'owner', retry: false });
    expect(caller).not.toHaveBeenCalled();
    expect(statements.some((sql) => sql.startsWith('SAVEPOINT'))).toBe(false);
  });

  it.each([
    ['database role', { user: 'stynx_owner', role: 'app', tenant: TENANT, actor: ACTOR }],
    ['app.role', { user: 'stynx_app', role: 'owner', tenant: TENANT, actor: ACTOR }],
    ['tenant', { user: 'stynx_app', role: 'app', tenant: 'other-tenant', actor: ACTOR }],
    ['actor', { user: 'stynx_app', role: 'app', tenant: TENANT, actor: 'other-actor' }],
  ])('rejects nested %s mismatch before savepoint or caller SQL', async (_name, live) => {
    const { database, statements } = harness(live);
    const caller = vi.fn(async () => undefined);
    await database.tx(async () => {
      await expect(database.tx(caller, command)).rejects.toThrow();
    }, { role: 'app', retry: false });
    expect(caller).not.toHaveBeenCalled();
    expect(statements.some((sql) => sql.startsWith('SAVEPOINT'))).toBe(false);
  });

  it('allows a nested command only after probing the matching live app identity', async () => {
    const { database, statements } = harness({ user: 'stynx_app', role: 'app', tenant: TENANT, actor: ACTOR });
    const caller = vi.fn(async (trx: { query(sql: string): Promise<unknown> }) => trx.query('select domain_write()'));
    await database.tx(async () => database.tx(caller, command), { role: 'app', retry: false });
    const probeIndex = statements.findIndex((sql) => /current_user|current_setting/u.test(sql));
    const savepointIndex = statements.findIndex((sql) => sql.startsWith('SAVEPOINT'));
    const callerIndex = statements.findIndex((sql) => sql.includes('domain_write'));
    expect(probeIndex).toBeGreaterThanOrEqual(0);
    expect(savepointIndex).toBeGreaterThan(probeIndex);
    expect(callerIndex).toBeGreaterThan(savepointIndex);
  });
});
