import { RequestContext, SystemContext, SystemContextRequiredError } from '@stynx-nyx/core';
import { ClsService } from 'nestjs-cls';
import type { PoolClient } from 'pg';
import {
  ActorContextMissingError,
  ReadOnlyViolationError,
  SerializationFailureError,
  StatementTimeoutError,
  TenantContextMissingError,
} from '../../src/errors';
import { Database } from '../../src/database';
import { StynxPoolRegistry } from '../../src/pools';
import type { StynxDataModuleOptions } from '../../src/tokens';
import type { Mock } from 'vitest';

describe('Database', () => {
  const options: StynxDataModuleOptions = {
    connections: {
      owner: { connectionString: 'postgres://owner' },
      app: { connectionString: 'postgres://app' },
      reader: { connectionString: 'postgres://reader' },
    },
  };

  const inactiveRequestContext = {
    hasActiveContext: () => false,
    snapshot: () => {
      throw new Error('inactive');
    },
  } as unknown as RequestContext;

  const failingSystemContext = {
    current: () => {
      throw new SystemContextRequiredError();
    },
    withSystemContext: async <T>(_reason: string, fn: () => Promise<T>) => fn(),
  } as unknown as SystemContext;

  const createDatabase = () =>
    new Database(
      inactiveRequestContext,
      failingSystemContext,
      {
        get: () => {
          throw new Error('no pool should be used');
        },
      } as unknown as StynxPoolRegistry,
      {
        get: () => undefined,
        set: () => undefined,
      } as unknown as ClsService<Record<PropertyKey, unknown>>,
      options,
    );

  const createClient = () => {
    const queries: Array<{ text: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        queries.push({ text, values });
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn(),
    } as unknown as PoolClient & {
      query: Mock;
      release: Mock;
    };
    return { client, queries };
  };

  const createPoolBackedDatabase = (
    client: PoolClient,
    overrides: {
      requestContext?: RequestContext;
      systemContext?: SystemContext;
      cls?: ClsService<Record<PropertyKey, unknown>>;
      moduleOptions?: StynxDataModuleOptions;
    } = {},
  ) =>
    new Database(
      overrides.requestContext
        ?? ({
          hasActiveContext: () => true,
          snapshot: () => ({
            requestId: 'req-1',
            tenantId: 'tenant-1',
            actorId: 'actor-1',
            sessionId: 'session-1',
            startedAt: new Date(),
          }),
        } as unknown as RequestContext),
      overrides.systemContext ?? failingSystemContext,
      {
        get: vi.fn((_role: string, _replica: boolean) => ({
          connect: vi.fn(async () => client),
        })),
      } as unknown as StynxPoolRegistry,
      overrides.cls
        ?? ({
          get: vi.fn(() => undefined),
          set: vi.fn(),
        } as unknown as ClsService<Record<PropertyKey, unknown>>),
      overrides.moduleOptions ?? options,
    );

  it('rejects reader transactions that are not readonly', async () => {
    const database = createDatabase();

    await expect(database.tx(async () => undefined, { role: 'reader' })).rejects.toMatchObject({
      context: { role: 'reader', readonly: false },
    });
  });

  it('rejects app transactions without tenant context', async () => {
    const database = createDatabase();

    await expect(database.tx(async () => undefined)).rejects.toBeInstanceOf(TenantContextMissingError);
  });

  it('rejects owner transactions outside system context', async () => {
    const database = createDatabase();

    await expect(database.tx(async () => undefined, { role: 'owner', readonly: true })).rejects.toBeInstanceOf(
      SystemContextRequiredError,
    );
  });

  it('rejects app transactions without actor context when tenant context exists', async () => {
    const database = new Database(
      {
        hasActiveContext: () => true,
        snapshot: () => ({
          requestId: 'req',
          tenantId: 'tenant',
          startedAt: new Date(),
        }),
      } as unknown as RequestContext,
      {
        current: () => {
          throw new SystemContextRequiredError();
        },
        withSystemContext: async <T>(_reason: string, fn: () => Promise<T>) => fn(),
      } as unknown as SystemContext,
      {
        get: () => ({
          connect: async () => ({
            query: async () => ({ rows: [] }),
            release: () => undefined,
          }),
        }),
      } as unknown as StynxPoolRegistry,
      {
        get: () => undefined,
        set: () => undefined,
      } as unknown as ClsService<Record<PropertyKey, unknown>>,
      {
        connections: {
          owner: { connectionString: 'postgres://owner' },
          app: { connectionString: 'postgres://app' },
          reader: { connectionString: 'postgres://reader' },
        },
      },
    );

    await expect(database.tx(async () => undefined)).rejects.toBeInstanceOf(ActorContextMissingError);
  });

  it('applies request session state, readonly mode, deadline, commit, context cleanup, and release', async () => {
    const { client, queries } = createClient();
    let activeContext: unknown;
    const cls = {
      get: vi.fn(() => activeContext),
      set: vi.fn((_key: PropertyKey, value: unknown) => {
        activeContext = value;
      }),
    } as unknown as ClsService<Record<PropertyKey, unknown>>;
    const database = createPoolBackedDatabase(client, { cls });

    const result = await database.tx(async (trx) => {
      const probe = await trx.query('select 1 as ok');
      expect(probe.rows).toEqual([]);
      return 'committed';
    }, { readonly: true, deadlineMs: 1500 });

    expect(result).toBe('committed');
    expect(queries.map((query) => query.text)).toEqual([
      'BEGIN',
      `SELECT set_config('app.role', $1, true)`,
      `SELECT set_config('app.request_id', $1, true)`,
      `SELECT set_config('app.tenant_id', $1, true)`,
      `SELECT set_config('app.actor_id', $1, true)`,
      `SELECT set_config('app.session_id', $1, true)`,
      'SET LOCAL TRANSACTION READ ONLY',
      `SELECT set_config('statement_timeout', $1, true)`,
      'select 1 as ok',
      'COMMIT',
    ]);
    expect(queries[1]?.values).toEqual(['app']);
    expect(queries[7]?.values).toEqual(['1500']);
    expect(cls.set).toHaveBeenCalledWith(expect.any(Symbol), expect.objectContaining({ savepointCounter: 0 }));
    expect(cls.set).toHaveBeenLastCalledWith(expect.any(Symbol), null);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('maps PostgreSQL readonly and statement-timeout errors during rollback', async () => {
    for (const [code, ErrorClass] of [
      ['25006', ReadOnlyViolationError],
      ['57014', StatementTimeoutError],
    ] as const) {
      const { client } = createClient();
      const database = createPoolBackedDatabase(client);
      const error = new Error(code) as Error & { code: string };
      error.code = code;

      await expect(database.tx(async () => {
        throw error;
      }, { retry: false })).rejects.toMatchObject({
        name: ErrorClass.name,
        context: { originalCode: code },
      });

      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalledTimes(1);
    }
  });

  it('preserves the original transaction error when rollback also fails', async () => {
    const { client } = createClient();
    const original = new Error('transaction failed');
    const rollback = new Error('rollback failed');
    client.query.mockImplementation(async (text: string, values?: unknown[]) => {
      if (text === 'ROLLBACK') {
        throw rollback;
      }
      return { rows: [], rowCount: 0, values };
    });
    const database = createPoolBackedDatabase(client);

    await expect(database.tx(async () => {
      throw original;
    }, { retry: false })).rejects.toBe(original);

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-PostgreSQL errors or retryable codes when retry is disabled', async () => {
    const plain = new Error('plain');
    const nonRetryableClient = createClient();
    const nonRetryableDatabase = createPoolBackedDatabase(nonRetryableClient.client);
    await expect(nonRetryableDatabase.tx(async () => {
      throw plain;
    }, { retry: { attempts: 3, jitterMs: [0, 0] } })).rejects.toBe(plain);
    expect(nonRetryableClient.client.release).toHaveBeenCalledTimes(1);

    const retryable = new Error('deadlock') as Error & { code: string };
    retryable.code = '40P01';
    const retryDisabledClient = createClient();
    const retryDisabledDatabase = createPoolBackedDatabase(retryDisabledClient.client);
    await expect(retryDisabledDatabase.tx(async () => {
      throw retryable;
    }, { retry: false })).rejects.toMatchObject<SerializationFailureError>({
      context: expect.objectContaining({ attempts: 1, code: '40P01' }),
    });
    expect(retryDisabledClient.client.release).toHaveBeenCalledTimes(1);
  });

  it('retries retryable errors and reports the final serialization failure context', async () => {
    const { client } = createClient();
    const database = createPoolBackedDatabase(client);
    const serialization = new Error('serialization') as Error & { code: string };
    serialization.code = '40001';
    const fn = vi.fn(async () => {
      throw serialization;
    });

    await expect(database.tx(fn, { retry: { attempts: 2, jitterMs: [0, 0] } })).rejects.toMatchObject<
      SerializationFailureError
    >({
      context: expect.objectContaining({
        attempts: 2,
        code: '40001',
        lastError: 'Error: serialization',
      }),
    });

    expect(fn).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  it('describes branch: treats a non-finite retry count as immediate serialization failure', async () => {
    const { client } = createClient();
    const database = createPoolBackedDatabase(client);

    await expect(database.tx(async () => 'unreached', {
      retry: { attempts: Number.NaN, jitterMs: [0, 0] },
    })).rejects.toBeInstanceOf(SerializationFailureError);

    expect(client.query).not.toHaveBeenCalledTimes(1);
    expect(client.release).not.toHaveBeenCalledTimes(1);
  });

  it('waits the computed jitter before retrying retryable transaction failures', async () => {
    vi.useFakeTimers();
    const timeoutSpy = vi.spyOn(global, 'setTimeout');
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { client } = createClient();
    const database = createPoolBackedDatabase(client);
    let attempts = 0;

    const promise = database.tx(async () => {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error('retry me') as Error & { code: string };
        error.code = '40001';
        throw error;
      }
      return 'retried';
    }, { retry: { attempts: 2, jitterMs: [10, 20] } });

    await vi.advanceTimersByTimeAsync(15);
    await expect(promise).resolves.toBe('retried');
    expect(timeoutSpy).toHaveBeenCalledWith(expect.any(Function), 15);
    expect(client.release).toHaveBeenCalledTimes(2);

    randomSpy.mockRestore();
    timeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it('does not classify non-Error retry codes or null transaction errors as retryable', async () => {
    const codedObject = { code: '40001' };
    const codedClient = createClient();
    const codedDatabase = createPoolBackedDatabase(codedClient.client);
    await expect(codedDatabase.tx(async () => {
      throw codedObject;
    }, { retry: { attempts: 2, jitterMs: [0, 0] } })).rejects.toBe(codedObject);
    expect(codedClient.client.release).toHaveBeenCalledTimes(1);

    const nullClient = createClient();
    const nullDatabase = createPoolBackedDatabase(nullClient.client);
    await expect(nullDatabase.tx(async () => {
      throw null;
    }, { retry: false })).rejects.toBe(null);
    expect(nullClient.client.release).toHaveBeenCalledTimes(1);
  });

  it('does not clear a CLS transaction slot that is already inactive in finally', async () => {
    const { client } = createClient();
    const cls = {
      get: vi.fn(() => undefined),
      set: vi.fn(),
    } as unknown as ClsService<Record<PropertyKey, unknown>>;
    const database = createPoolBackedDatabase(client, { cls });

    await database.tx(async () => 'done');

    expect(cls.set).toHaveBeenCalledTimes(1);
    expect(cls.set).toHaveBeenCalledWith(expect.any(Symbol), expect.objectContaining({ savepointCounter: 0 }));
  });

  it('rejects replica write transactions before resolving tenant context', async () => {
    const database = new Database(
      inactiveRequestContext,
      failingSystemContext,
      {
        get: () => {
          throw new Error('pool should not be used');
        },
      } as unknown as StynxPoolRegistry,
      {
        get: vi.fn(() => undefined),
        set: vi.fn(),
      } as unknown as ClsService<Record<PropertyKey, unknown>>,
      options,
    );

    await expect(database.tx(async () => undefined, { replica: true })).rejects.toMatchObject({
      context: { role: 'app', readonly: false, replica: true },
    });
  });

  it('uses replica pool options through withReplica', async () => {
    const { client } = createClient();
    const pool = {
      connect: vi.fn(async () => client),
    };
    const registry = {
      get: vi.fn(() => pool),
    } as unknown as StynxPoolRegistry;
    const database = new Database(
      {
        hasActiveContext: () => true,
        snapshot: () => ({
          requestId: 'req-reader',
          tenantId: 'tenant-reader',
          actorId: 'actor-reader',
          startedAt: new Date(),
        }),
      } as unknown as RequestContext,
      failingSystemContext,
      registry,
      {
        get: vi.fn(() => undefined),
        set: vi.fn(),
      } as unknown as ClsService<Record<PropertyKey, unknown>>,
      options,
    );

    await database.withReplica(async () => 'ok');

    expect(registry.get).toHaveBeenCalledWith('reader', true);
    expect(client.query).toHaveBeenCalledWith('SET LOCAL TRANSACTION READ ONLY');
  });

  it('delegates system context without changing the provided execution context', async () => {
    const systemContext = {
      current: () => ({ requestId: 'sys-1' }),
      withSystemContext: vi.fn(async (_reason: string, fn: (context: unknown) => Promise<string>) =>
        fn({ system: true }),
      ),
    } as unknown as SystemContext & { withSystemContext: Mock };
    const database = new Database(
      inactiveRequestContext,
      systemContext,
      {
        get: () => {
          throw new Error('unused');
        },
      } as unknown as StynxPoolRegistry,
      {
        get: vi.fn(() => undefined),
        set: vi.fn(),
      } as unknown as ClsService<Record<PropertyKey, unknown>>,
      options,
    );

    await expect(database.withSystemContext('maintenance', async (context) => JSON.stringify(context))).resolves.toBe(
      '{"system":true}',
    );
    expect(systemContext.withSystemContext).toHaveBeenCalledWith('maintenance', expect.any(Function));
  });

  it('runs nested transactions with savepoints and maps nested errors', async () => {
    const { client } = createClient();
    const active = {
      client,
      db: { select: vi.fn() },
      savepointCounter: 0,
    };
    const database = createPoolBackedDatabase(client, {
      cls: {
        get: vi.fn(() => active),
        set: vi.fn(),
      } as unknown as ClsService<Record<PropertyKey, unknown>>,
    });

    await expect(database.tx(async (trx) => {
      await trx.query('select nested');
      return 'nested';
    })).resolves.toBe('nested');
    expect(active.savepointCounter).toBe(1);
    expect(client.query).toHaveBeenCalledWith('SAVEPOINT stynx_sp_1');
    expect(client.query).toHaveBeenCalledWith('RELEASE SAVEPOINT stynx_sp_1');

    const timeout = new Error('timeout') as Error & { code: string };
    timeout.code = '57014';
    await expect(database.tx(async () => {
      throw timeout;
    })).rejects.toBeInstanceOf(StatementTimeoutError);
    expect(active.savepointCounter).toBe(2);
    expect(client.query).toHaveBeenCalledWith('SAVEPOINT stynx_sp_2');
    expect(client.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT stynx_sp_2');
  });

  it('resolves owner execution context from the system context', async () => {
    const { client, queries } = createClient();
    const current = vi.fn(() => ({ requestId: 'sys-req', actorId: 'sys-actor' }));
    const database = createPoolBackedDatabase(client, {
      requestContext: inactiveRequestContext,
      systemContext: {
        current,
        withSystemContext: async <T>(_reason: string, fn: () => Promise<T>) => fn(),
      } as unknown as SystemContext,
    });

    await database.tx(async () => 'owner', { role: 'owner', readonly: true });

    expect(queries).toEqual(expect.arrayContaining([
      { text: `SELECT set_config('app.role', $1, true)`, values: ['owner'] },
      { text: `SELECT set_config('app.request_id', $1, true)`, values: ['sys-req'] },
      { text: `SELECT set_config('app.actor_id', $1, true)`, values: ['sys-actor'] },
    ]));
    expect(queries.some((query) => query.text.includes('app.tenant_id'))).toBe(false);
    expect(queries.some((query) => query.text.includes('app.session_id'))).toBe(false);
    expect(current).toHaveBeenCalledTimes(2);
  });

  it('omits optional owner request and actor GUCs when system context lacks them', async () => {
    const { client, queries } = createClient();
    const database = createPoolBackedDatabase(client, {
      requestContext: inactiveRequestContext,
      systemContext: {
        current: () => ({}),
        withSystemContext: async <T>(_reason: string, fn: () => Promise<T>) => fn(),
      } as unknown as SystemContext,
    });

    await database.tx(async () => 'owner', { role: 'owner', readonly: true });

    expect(queries.some((query) => query.text.includes('app.request_id'))).toBe(false);
    expect(queries.some((query) => query.text.includes('app.actor_id'))).toBe(false);
  });
});
