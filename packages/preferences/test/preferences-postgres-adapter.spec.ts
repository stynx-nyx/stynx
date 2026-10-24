import { describe, expect, it, vi } from 'vitest';
import { executeTypedQuery, QueryRowValidationError, type Transaction } from '@stynx-nyx/data';
import { PostgresPreferencesStore } from '../src/postgres-preferences.store.js';
import { tenantA } from './support/preferences-harness.js';

function checkedTransaction(query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>) {
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  return { query, run };
}

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
    const tx = vi.fn(async (operation: (trx: ReturnType<typeof checkedTransaction>) => unknown) =>
      operation(checkedTransaction(query)),
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

  function mappedStore(patch: Record<string, unknown> = {}) {
    const row = {
      tenant_id: tenantA, subject_id: 'subject-1', display_name: null, avatar_document_id: null,
      preference_overrides: {}, revision: '9007199254740993',
      created_at: new Date('2026-08-30T00:00:00.789Z'),
      updated_at: '2026-08-30T01:00:00.123Z', ...patch,
    };
    const query = vi.fn(async (_text: string, _params?: unknown[]) => ({ rows: [row] }));
    const database = {
      tx: vi.fn(async (operation: (trx: ReturnType<typeof checkedTransaction>) => unknown) => operation(checkedTransaction(query))),
      withRequestContext: vi.fn(async (_context: unknown, operation: () => unknown) => operation()),
    };
    return { query, store: new PostgresPreferencesStore({ get: () => database } as never) };
  }

  it('retains Date milliseconds, parser strings, Number revision mapping and nested opaque extensions', async () => {
    const overrides = {
      extension: { opaque: [null, true] },
      theme: { colorScheme: 'dark', extension: { opaque: 'retained' } },
    };
    const { store, query } = mappedStore({ preference_overrides: overrides });
    await expect(store.read({ tenantId: tenantA, subjectId: 'subject-1' })).resolves.toMatchObject({
      createdAt: '2026-08-30T00:00:00.789Z', updatedAt: '2026-08-30T01:00:00.123Z',
      revision: Number('9007199254740993'), overrides,
    });
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('from profile.subject_preferences'), [tenantA, 'subject-1']);
  });

  describe.each(['created_at', 'updated_at'])('%s mapper error boundary', (field) => {
    it.each([new Date(Number.NaN), Infinity, -Infinity, 'not-a-timestamp'])(
      'preserves the existing RangeError after query execution for %s', async (value) => {
        const { store, query } = mappedStore({ [field]: value });
        await expect(store.read({ tenantId: tenantA, subjectId: 'subject-1' })).rejects.toBeInstanceOf(RangeError);
        expect(query).toHaveBeenCalledTimes(1);
      },
    );
  });

  it.each([
    { display_name: 42 },
    { preference_overrides: { accessibility: { reduceMotion: 'private-driver-value' } } },
    { revision: { private: 'private-driver-value' } },
  ])('rejects malformed declared result fields without exposing driver data', async (patch) => {
    const { store, query } = mappedStore(patch);
    const error = await store.read({ tenantId: tenantA, subjectId: 'subject-1' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(JSON.stringify(error)).not.toContain('private-driver-value');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['locale'], ['theme'], ['accessibility'], ['notificationDelivery'],
    ['locale', 'locale'], ['locale', 'timezone'],
    ['theme', 'colorScheme'], ['theme', 'contrast'], ['theme', 'density'],
    ['accessibility', 'reduceMotion'], ['accessibility', 'largeText'], ['accessibility', 'screenReaderOptimized'],
    ['notificationDelivery', 'email'], ['notificationDelivery', 'push'], ['notificationDelivery', 'inApp'],
  ].map((path) => ({ path })))('rejects explicitly undefined declared preference location $path', async ({ path }) => {
    const overrides = path.length === 1 ? { [path[0]]: undefined } : { [path[0]]: { [path[1]]: undefined } };
    const { store, query } = mappedStore({ preference_overrides: overrides });
    await expect(store.read({ tenantId: tenantA, subjectId: 'subject-1' })).rejects.toBeInstanceOf(QueryRowValidationError);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('keeps missing categories and leaves absent without synthesizing undefined keys', async () => {
    for (const overrides of [{}, { locale: {}, theme: {}, accessibility: {}, notificationDelivery: {} }]) {
      const { store } = mappedStore({ preference_overrides: overrides });
      const result = await store.read({ tenantId: tenantA, subjectId: 'subject-1' });
      expect(result?.overrides).toEqual(overrides);
      expect(Object.keys(result?.overrides ?? {})).toEqual(Object.keys(overrides));
      expect(Object.hasOwn(result?.overrides.locale ?? {}, 'locale')).toBe(false);
    }
  });

  it('retains declared false, empty text, enum values and opaque nested extension identity', async () => {
    const extension = { nested: [undefined, new Date('2026-01-01T00:00:00Z')] };
    const overrides = {
      locale: { locale: '', timezone: '', extension },
      theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable', extension },
      accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
      notificationDelivery: { email: false, push: false, inApp: false },
      extension,
    };
    const { store } = mappedStore({ preference_overrides: overrides });
    const result = await store.read({ tenantId: tenantA, subjectId: 'subject-1' });
    expect(result?.overrides).toEqual(overrides);
    expect(result?.overrides.extension).toBe(extension);
    expect(result?.overrides.locale?.extension).toBe(extension);
    expect(result?.overrides.theme?.extension).toBe(extension);
  });

});
