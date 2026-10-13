import type { RequestContext, SystemContext } from '@stynx-nyx/core';
import type { ClsService } from 'nestjs-cls';
import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { Database } from '../../src/database';
import type { StynxPoolRegistry } from '../../src/pools';

// INV-OFFLINE-001; D1.1: transaction rollback must preserve malformed business failures without executing code accessors.
// The real Database/Transaction execute; only the external pg client is a unit fixture.
function databaseFixture() {
  const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
  const release = vi.fn();
  const client = { query, release } as unknown as PoolClient;
  const database = new Database(
    {
      hasActiveContext: () => true,
      snapshot: () => ({
        requestId: 'domain-code-negative-witness',
        tenantId: 'tenant-a',
        actorId: 'actor-a',
        startedAt: new Date(),
      }),
    } as unknown as RequestContext,
    {
      current: () => {
        throw new Error('Unexpected system context');
      },
    } as unknown as SystemContext,
    {
      get: () => ({ connect: async () => client }),
      ensureAppRole: async () => undefined,
    } as unknown as StynxPoolRegistry,
    { get: () => undefined, set: () => undefined } as unknown as ClsService<
      Record<PropertyKey, unknown>
    >,
    {
      connections: {
        owner: { connectionString: 'postgres://owner' },
        app: { connectionString: 'postgres://app' },
        reader: { connectionString: 'postgres://reader' },
      },
    },
  );
  return { database, query, release };
}

describe('Database own-data error code boundary', () => {
  for (const code of ['40001', '57014'] as const) {
    it(`does not execute a code getter or reinterpret its ${code} result`, async () => {
      const { database, query, release } = databaseFixture();
      let accesses = 0;
      const failure = Object.defineProperty(new Error('consumer business refusal'), 'code', {
        get: () => {
          accesses += 1;
          return code;
        },
      });
      const body = vi.fn(async () => {
        throw failure;
      });
      await expect(
        database.tx(body, { strictItemMode: true, retry: { attempts: 3, jitterMs: [0, 0] } }),
      ).rejects.toBe(failure);
      expect(accesses).toBe(0);
      expect(body).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith('ROLLBACK');
      expect(query).not.toHaveBeenCalledWith('COMMIT');
      expect(release).toHaveBeenCalledTimes(1);
      expect(database.hasHeldConnection()).toBe(false);
    });

    it(`does not use an inherited ${code} to retry or remap a business failure`, async () => {
      const { database, query, release } = databaseFixture();
      const failure = new Error('consumer business refusal');
      Object.setPrototypeOf(failure, Object.assign(Object.create(Error.prototype), { code }));
      const body = vi.fn(async () => {
        throw failure;
      });
      await expect(
        database.tx(body, { strictItemMode: true, retry: { attempts: 3, jitterMs: [0, 0] } }),
      ).rejects.toBe(failure);
      expect(Object.hasOwn(failure, 'code')).toBe(false);
      expect(body).toHaveBeenCalledTimes(1);
      expect(query).toHaveBeenCalledWith('ROLLBACK');
      expect(query).not.toHaveBeenCalledWith('COMMIT');
      expect(release).toHaveBeenCalledTimes(1);
    });
  }
});
