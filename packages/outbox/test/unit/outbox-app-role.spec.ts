import type { Transaction } from '@stynx-nyx/data';
import { OUTBOX_APP_ROLE_CHECKED_RELATIONS } from '../../src/constants';
import {
  OutboxAppRoleOwnershipError,
  OutboxEventTransactionError,
  OutboxOwnershipContentionError,
} from '../../src/errors';
import { OutboxEventStreamSource } from '../../src/event-stream-source';
import { OutboxService } from '../../src/outbox.service';
import type { OutboxSqlExecutor } from '../../src/types';

// INV-TENANCY-001; UPS-OBX-10 (ADR-OUTBOX-0003 D1 items 2, 5 and 7): the
// request-path sites compare current_user with the configured role, refuse
// with a typed reason, and the module refuses to boot when the application
// role owns, or is a member of the owner of, an outbox relation.
const TENANT = '11111111-1111-1111-1111-111111111111';
const live = {
  tenant_id: TENANT,
  role: 'app',
  sql_role: 'stynx_app',
  isolation: 'read committed',
  read_only: 'off',
  recovery: false,
};
const scope = { tenantId: TENANT, actorId: 'actor' };
const event = { entity: 'renach.exam', entityId: 'e-1', idempotencyKey: 'k-1', payload: {} };

interface OwnershipRow {
  relation: string;
  owner: string;
  owns: boolean | null;
  member: boolean | null;
}

function appendHarness(
  appRoleName: string,
  state: Partial<typeof live>,
  trxRole: 'app' | 'owner' = 'app',
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("current_setting('app.tenant_id'")) return { rows: [{ ...live, ...state }] };
    return { rows: [] };
  });
  const database = {
    appRoleName,
    currentTenantId: () => TENANT,
    tx: vi.fn(async (fn: (trx: never) => Promise<unknown>) =>
      fn({ role: 'owner', query } as never),
    ),
    withSystemContext: vi.fn(async (_reason: string, fn: () => Promise<unknown>) => fn()),
  };
  const service = new OutboxService(database as never, {});
  return { service, query, trx: { role: trxRole, query } as unknown as Transaction };
}

function streamHarness(
  appRoleName: string,
  state: { recovery: boolean; role: string; sql_role: string },
) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('pg_is_in_recovery')) return { rows: [state] };
    if (sql.includes('returning last_ms')) return { rows: [{ last_ms: '5' }] };
    return { rows: [] };
  });
  const trx = { query } as unknown as OutboxSqlExecutor;
  const database = {
    appRoleName,
    hasHeldConnection: () => false,
    withRequestContext: async (_scope: unknown, fn: () => Promise<unknown>) => fn(),
    tx: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(trx),
    txIndependent: async (fn: (tx: OutboxSqlExecutor) => Promise<unknown>) => fn(trx),
  };
  return { source: new OutboxEventStreamSource(database as never), query };
}

function bootstrapHarness(appRoleName: string, rows: OwnershipRow[] | Error) {
  const query = vi.fn(async () => {
    if (rows instanceof Error) throw rows;
    return { rows };
  });
  const options: unknown[] = [];
  const reasons: string[] = [];
  const database = {
    appRoleName,
    currentTenantId: () => TENANT,
    tx: vi.fn(async (fn: (trx: never) => Promise<unknown>, txOptions: unknown) => {
      options.push(txOptions);
      return fn({ role: 'owner', query } as never);
    }),
    withSystemContext: vi.fn(async (reason: string, fn: () => Promise<unknown>) => {
      reasons.push(reason);
      return fn();
    }),
  };
  return { service: new OutboxService(database as never, {}), query, options, reasons };
}

async function failure(run: () => Promise<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('OutboxEventTransactionError typed reason', () => {
  it('keeps the 1.5.3 code, status and message and adds the reason additively', () => {
    const bare = new OutboxEventTransactionError();
    expect(bare).toMatchObject({ code: 'OUTBOX_EVENT_TRANSACTION', status: 409 });
    expect(bare.message).toBe(
      'Append requires a writable READ COMMITTED app transaction on primary',
    );
    expect(bare.reason).toBe(undefined);
    expect(bare.context).toBe(undefined);
    const typed = new OutboxEventTransactionError('sql_role');
    expect(typed).toMatchObject({
      code: 'OUTBOX_EVENT_TRANSACTION',
      status: 409,
      reason: 'sql_role',
      context: { reason: 'sql_role' },
    });
    expect(typed.message).toBe(bare.message);
  });
});

describe('appendManyInTransaction application role', () => {
  it.each([
    ['transaction_role', {}, 'owner'],
    ['tenant', { tenant_id: null }, 'app'],
    ['app_role', { role: 'owner' }, 'app'],
    ['sql_role', { sql_role: 'stynx_owner' }, 'app'],
    ['sql_role', { sql_role: 'stynx_app' }, 'app', 'role_app_backend'],
    ['isolation', { isolation: 'repeatable read' }, 'app'],
    ['read_only', { read_only: 'on' }, 'app'],
    ['recovery', { recovery: true }, 'app'],
  ] as const)(
    'refuses with reason %s',
    async (reason, state, trxRole, appRoleName = 'stynx_app') => {
      const { service, trx, query } = appendHarness(
        appRoleName,
        state as Partial<typeof live>,
        trxRole,
      );
      const error = await failure(() => service.appendManyInTransaction(trx, [event]));
      expect(error).toBeInstanceOf(OutboxEventTransactionError);
      expect(error).toMatchObject({
        code: 'OUTBOX_EVENT_TRANSACTION',
        reason,
        context: { reason },
      });
      expect(query.mock.calls.some(([sql]) => String(sql).includes('stynx_app'))).toBe(false);
      expect(query.mock.calls.some(([sql]) => String(sql).includes('outbox.tenant_clock'))).toBe(
        false,
      );
    },
  );

  it('accepts the configured role name instead of the default literal', async () => {
    const { service, trx } = appendHarness('role_app_backend', { sql_role: 'role_app_backend' });
    const error = await failure(() => service.appendManyInTransaction(trx, [event]));
    expect(error).not.toBeInstanceOf(OutboxEventTransactionError);
    expect(error).toBeInstanceOf(OutboxOwnershipContentionError);
  });

  it('passes the guard under the default role before the ownership marker is read', async () => {
    const { service, trx } = appendHarness('stynx_app', {});
    const error = await failure(() =>
      service.appendManyInTransaction(trx, [{ ...event, entityId: '' }]),
    );
    expect(error).toBeInstanceOf(OutboxOwnershipContentionError);
  });
});

describe('OutboxEventStreamSource application role', () => {
  it.each([
    ['recovery', { recovery: true, role: 'app', sql_role: 'stynx_app' }, 'stynx_app'],
    ['app_role', { recovery: false, role: 'owner', sql_role: 'stynx_app' }, 'stynx_app'],
    ['sql_role', { recovery: false, role: 'app', sql_role: 'stynx_owner' }, 'stynx_app'],
    ['sql_role', { recovery: false, role: 'app', sql_role: 'stynx_app' }, 'role_app_backend'],
  ] as const)('refuses reads and the clock with reason %s', async (reason, state, appRoleName) => {
    const { source, query } = streamHarness(appRoleName, state);
    for (const run of [
      () => source.findById('11111111-1111-4111-8111-111111111111', scope),
      () => source.listSince({ createdAt: new Date(0), id: '' }, scope, 1),
      () => source.now(scope),
    ]) {
      const error = await failure(run);
      expect(error).toBeInstanceOf(OutboxEventTransactionError);
      expect(error).toMatchObject({ reason, context: { reason } });
    }
    expect(query.mock.calls.some(([sql]) => String(sql).includes('stynx_app'))).toBe(false);
  });

  it('accepts the configured role name', async () => {
    const { source } = streamHarness('role_app_backend', {
      recovery: false,
      role: 'app',
      sql_role: 'role_app_backend',
    });
    await expect(source.now(scope)).resolves.toEqual(new Date(5));
    await expect(source.listSince({ createdAt: new Date(0), id: '' }, scope, 1)).resolves.toEqual(
      [],
    );
  });
});

describe('OutboxService bootstrap ownership check', () => {
  const clean: OwnershipRow[] = OUTBOX_APP_ROLE_CHECKED_RELATIONS.map((relation) => ({
    relation,
    owner: 'stynx_owner',
    owns: false,
    member: false,
  }));

  it('lists the D2 closed relations and queries them as data on an owner connection', async () => {
    expect([...OUTBOX_APP_ROLE_CHECKED_RELATIONS].sort()).toEqual([
      'ack_quarantine',
      'acknowledgements',
      'event_acks',
      'event_attempts',
      'event_delivery',
      'event_order_seq',
      'events',
      'legacy_event_map',
      'legacy_ownership',
      'messages',
      'tenant_clock',
    ]);
    const { service, query, options, reasons } = bootstrapHarness('role_app_backend', clean);
    await expect(service.onModuleInit()).resolves.toBe(undefined);
    expect(reasons).toEqual(['outbox application role check']);
    expect(options).toEqual([{ role: 'owner', readonly: true, retry: false }]);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/pg_class/u);
    expect(sql).toMatch(/pg_has_role/u);
    expect(sql).not.toContain('role_app_backend');
    expect(sql).not.toContain('stynx_app');
    expect(params).toEqual(['role_app_backend', [...OUTBOX_APP_ROLE_CHECKED_RELATIONS]]);
  });

  it('passes when no checked relation exists yet', async () => {
    const { service } = bootstrapHarness('stynx_app', []);
    await expect(service.onModuleInit()).resolves.toBe(undefined);
  });

  it.each([
    ['owns', { relation: 'events', owner: 'role_app_backend', owns: true, member: true }],
    ['member', { relation: 'event_attempts', owner: 'stynx_owner', owns: false, member: true }],
    ['exists', { relation: 'tenant_clock', owner: 'stynx_owner', owns: null, member: null }],
  ] as const)('prevents startup typed when the role fails %s', async (property, row) => {
    const { service } = bootstrapHarness('role_app_backend', [clean[0]!, row]);
    const error = await failure(() => service.onModuleInit());
    expect(error).toBeInstanceOf(OutboxAppRoleOwnershipError);
    expect(error).toMatchObject({
      code: 'OUTBOX_APP_ROLE_OWNERSHIP',
      status: 500,
      context: {
        property,
        role: 'role_app_backend',
        relation: `outbox.${row.relation}`,
        owner: row.owner,
      },
    });
    expect((error as Error).message).not.toMatch(/password/iu);
  });

  it('propagates a database failure so startup is not silently allowed', async () => {
    const { service } = bootstrapHarness('stynx_app', new Error('connection refused'));
    await expect(service.onModuleInit()).rejects.toThrow('connection refused');
  });
});
