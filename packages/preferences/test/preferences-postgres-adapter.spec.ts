import { describe, expect, it, vi } from 'vitest';
import { PostgresPreferencesStore } from '../src/postgres-preferences.store.js';
import { tenantA } from './support/preferences-harness.js';

describe('preferences Postgres mapping and compare-and-set contract', () => {
  it('maps Postgres reads and compare-and-set insert, update, and conflict results', async () => {
    const scope = { tenantId: tenantA, subjectId: 'subject-1' };
    const row = {
      tenant_id: tenantA,
      subject_id: 'subject-1',
      display_name: 'Ada',
      avatar_document_id: 'avatar-1',
      preference_overrides: { theme: { colorScheme: 'dark' as const } },
      revision: '3',
      created_at: '2026-08-30T00:00:00.000Z',
      updated_at: new Date('2026-08-30T01:00:00.000Z'),
    };
    const returnedRows = [[row], [], [row], [row], []];
    const query = vi.fn(async () => ({ rows: returnedRows.shift() ?? [] }));
    const tx = vi.fn(async (operation: (trx: { query: typeof query }) => unknown) =>
      operation({ query }),
    );
    const withRequestContext = vi.fn(async (_context, operation: () => unknown) => operation());
    const database = { tx, withRequestContext };
    const get = vi.fn(() => database);
    const store = new PostgresPreferencesStore({ get } as never);

    await expect(store.read(scope)).resolves.toEqual({
      scope,
      displayName: 'Ada',
      avatarDocumentId: 'avatar-1',
      overrides: { theme: { colorScheme: 'dark' } },
      revision: 3,
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T01:00:00.000Z',
    });
    await expect(store.read(scope)).resolves.toBe(null);
    const mutation = {
      scope,
      expectedRevision: 0,
      displayName: 'Ada',
      avatarDocumentId: null,
      overrides: { theme: { colorScheme: 'dark' as const } },
    };
    await expect(store.compareAndSet(mutation)).resolves.toMatchObject({ revision: 3 });
    await expect(store.compareAndSet({ ...mutation, expectedRevision: 3 })).resolves.toMatchObject({
      revision: 3,
    });
    await expect(store.compareAndSet({ ...mutation, expectedRevision: 4 })).resolves.toBe(
      'conflict',
    );

    expect(get).toHaveBeenCalledWith(expect.anything(), { strict: false });
    expect(withRequestContext).toHaveBeenCalledWith(
      { tenantId: tenantA, actorId: 'subject-1' },
      expect.any(Function),
    );
    expect(tx.mock.calls[0]?.[1]).toEqual({ readonly: true });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('insert into'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('update profile'))).toBe(true);
  });
});
