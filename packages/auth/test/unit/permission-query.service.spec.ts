import type { ModuleRef } from '@nestjs/core';
import { Database } from '@stynx/data';
import { RequestContext, RequestContextMutator } from '@stynx/core';
import { PermissionQueryService } from '../../src/permission-query.service';
import type { Mock } from 'vitest';

function createQueryResult(rows: unknown[]) {
  return { rows };
}

describe('PermissionQueryService', () => {
  it('resolves membership permissions inside an existing request context', async () => {
    const trx = {
      query: vi
        .fn()
        .mockResolvedValueOnce(
          createQueryResult([
            {
              membership_id: 'membership-1',
              effective_hash: 'effective-hash',
              effective_hash_generation: 7,
            },
          ]),
        )
        .mockResolvedValueOnce(
          createQueryResult([
            { key: 'document:*:*' },
            { key: 'document:read:*' },
          ]),
        )
        .mockResolvedValueOnce(
          createQueryResult([
            { key: 'document:read:*' },
            { key: 'document:write:*' },
          ]),
        ),
    };
    const database = {
      tx: vi.fn(async (fn: (arg: typeof trx) => Promise<unknown>) => fn(trx)),
    };
    const requestContextMutator = {
      patch: vi.fn(),
      runWithRequestContext: vi.fn(),
    };
    const requestContext = {
      hasActiveContext: vi.fn(() => true),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === Database) return database;
        if (token === RequestContext) return requestContext;
        if (token === RequestContextMutator) return requestContextMutator;
        return undefined;
      }),
    } as unknown as ModuleRef;

    const service = new PermissionQueryService(moduleRef);

    await expect(service.resolveForUser('user-1', 'tenant-1')).resolves.toMatchObject({
      membershipId: 'membership-1',
      permissions: ['document:*:*', 'document:read:*', 'document:write:*'],
      generation: 7,
    });
    expect(requestContextMutator.patch).toHaveBeenCalledWith({ tenantId: 'tenant-1', actorId: 'user-1' });
    expect(requestContextMutator.runWithRequestContext).not.toHaveBeenCalled();
  });

  it('creates a request context when none is active and supports probeHash', async () => {
    const trx = {
      query: vi.fn().mockResolvedValue(
        createQueryResult([
          { effective_hash: 'hash-1', effective_hash_generation: 3 },
        ]),
      ),
    };
    const database = {
      tx: vi.fn(async (fn: (arg: typeof trx) => Promise<unknown>) => fn(trx)),
    };
    const requestContextMutator = {
      patch: vi.fn(),
      runWithRequestContext: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
    };
    const requestContext = {
      hasActiveContext: vi.fn(() => false),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === Database) return database;
        if (token === RequestContext) return requestContext;
        if (token === RequestContextMutator) return requestContextMutator;
        return undefined;
      }),
    } as unknown as ModuleRef;

    const service = new PermissionQueryService(moduleRef);

    await expect(service.probeHash('user-1', 'tenant-1')).resolves.toEqual({
      hash: 'hash-1',
      generation: 3,
    });
    expect(requestContextMutator.runWithRequestContext).toHaveBeenCalled();
  });

  it('creates a request context when the mutator exists but RequestContext is unavailable', async () => {
    const trx = {
      query: vi.fn().mockResolvedValue(createQueryResult([
        { effective_hash: 'hash-missing-context', effective_hash_generation: 4 },
      ])),
    };
    const database = {
      tx: vi.fn(async (fn: (arg: typeof trx) => Promise<unknown>) => fn(trx)),
    };
    const requestContextMutator = {
      patch: vi.fn(),
      runWithRequestContext: vi.fn(async (_ctx: unknown, fn: () => Promise<unknown>) => fn()),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === Database) return database;
        if (token === RequestContextMutator) return requestContextMutator;
        return undefined;
      }),
    } as unknown as ModuleRef;
    const service = new PermissionQueryService(moduleRef);

    await expect(service.probeHash('user-no-context', 'tenant-no-context')).resolves.toEqual({
      hash: 'hash-missing-context',
      generation: 4,
    });
    expect(requestContextMutator.patch).not.toHaveBeenCalled();
    expect(requestContextMutator.runWithRequestContext).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-no-context', actorId: 'user-no-context' }),
      expect.any(Function),
    );
  });

  it('throws when membership is missing or database provider is unavailable', async () => {
    const database = {
      tx: vi.fn(async (fn: (arg: { query: Mock }) => Promise<unknown>) => fn({
        query: vi.fn().mockResolvedValue(createQueryResult([])),
      })),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === Database) return database;
        if (token === RequestContextMutator) return undefined;
        if (token === RequestContext) return undefined;
        return undefined;
      }),
    } as unknown as ModuleRef;

    const service = new PermissionQueryService(moduleRef);
    await expect(service.resolveForUser('user-1', 'tenant-1')).rejects.toThrow('TENANT_ACCESS_DENIED');

    const missingDbModuleRef = {
      get: vi.fn(() => undefined),
    } as unknown as ModuleRef;
    const missingDbService = new PermissionQueryService(missingDbModuleRef);
    await expect(missingDbService.probeHash('user-1', 'tenant-1')).rejects.toThrow(
      'Database provider is unavailable to PermissionQueryService',
    );
  });

  it('runs without a request context mutator and issues the expected membership queries', async () => {
    const trx = {
      query: vi
        .fn()
        .mockImplementation((sql: string) => {
          if (sql.includes('from auth.memberships') && sql.includes('limit 1')) {
            return Promise.resolve(createQueryResult([
              {
                membership_id: 'membership-2',
                effective_hash: null,
                effective_hash_generation: null,
              },
            ]));
          }
          if (sql.includes('from auth.direct_perms direct_perm')) {
            return Promise.resolve(createQueryResult([{ key: 'storage:*:*' }]));
          }
          if (sql === 'select key from auth.perms') {
            return Promise.resolve(createQueryResult([{ key: 'storage:read:*' }, { key: 'storage:write:*' }]));
          }
          throw new Error(`Unexpected SQL: ${sql}`);
        }),
    };
    const database = {
      tx: vi.fn(async (fn: (arg: typeof trx) => Promise<unknown>) => fn(trx)),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === Database) return database;
        return undefined;
      }),
    } as unknown as ModuleRef;
    const service = new PermissionQueryService(moduleRef);

    await expect(service.resolveForUser('user-2', 'tenant-2')).resolves.toMatchObject({
      membershipId: 'membership-2',
      permissions: ['storage:*:*', 'storage:read:*', 'storage:write:*'],
      generation: 0,
    });
    expect(database.tx).toHaveBeenCalled();
    expect(trx.query).toHaveBeenCalledWith(expect.stringContaining('where user_id = $1'), ['user-2', 'tenant-2']);
    expect(trx.query).toHaveBeenCalledWith(expect.stringContaining('select distinct perm.key'), ['membership-2']);
    expect(trx.query).toHaveBeenCalledWith('select key from auth.perms');
  });

  it('returns null hash and zero generation when probeHash finds no active membership', async () => {
    const trx = {
      query: vi.fn().mockResolvedValue(createQueryResult([])),
    };
    const database = {
      tx: vi.fn(async (fn: (arg: typeof trx) => Promise<unknown>) => fn(trx)),
    };
    const requestContextMutator = {
      patch: vi.fn(),
      runWithRequestContext: vi.fn(),
    };
    const requestContext = {
      hasActiveContext: vi.fn(() => true),
    };
    const moduleRef = {
      get: vi.fn((token: unknown) => {
        if (token === Database) return database;
        if (token === RequestContext) return requestContext;
        if (token === RequestContextMutator) return requestContextMutator;
        return undefined;
      }),
    } as unknown as ModuleRef;
    const service = new PermissionQueryService(moduleRef);

    await expect(service.probeHash('user-3', 'tenant-3')).resolves.toEqual({ hash: null, generation: 0 });
    expect(requestContextMutator.patch).toHaveBeenCalledWith({ tenantId: 'tenant-3', actorId: 'user-3' });
  });
});
