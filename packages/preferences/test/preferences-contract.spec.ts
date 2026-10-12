import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@stynx-nyx/core';
import { InMemoryPreferencesStore } from '../src/in-memory-preferences.store';
import { PreferencesService } from '../src/preferences.service';
import { PLATFORM_PREFERENCE_DEFAULTS } from '../src/schema';
import type { PreferenceValues } from '../src/types';
import {
  harness,
  changed,
  tenantA,
  tenantB,
  preferencesError,
  errorCode,
} from './support/preferences-harness';

describe('preferences defaults and trusted scope', () => {
  it('returns complete defaults and isolates tenant plus opaque subject keys', async () => {
    const { store, service } = harness();
    expect(await service.getPreferences()).toEqual({
      values: PLATFORM_PREFERENCE_DEFAULTS,
      revision: 0,
      updatedAt: null,
    });
    await service.putPreferences(changed, 0);
    expect(await store.read({ tenantId: tenantB, subjectId: 'external|subject-1' })).toEqual(null);
    expect(await store.read({ tenantId: tenantA, subjectId: 'external|subject-2' })).toEqual(null);
  });

  it('rejects invalid configured defaults and requests the non-strict request context', async () => {
    const get = vi.fn(() => ({ tenantId: tenantA, actorId: 'subject' }));
    const store = new InMemoryPreferencesStore();
    expect(
      () =>
        new PreferencesService(
          { get } as never,
          store,
          { defaults: { ...PLATFORM_PREFERENCE_DEFAULTS, theme: {} } as PreferenceValues },
          { write: vi.fn() },
          { resolve: async () => null },
        ),
    ).toThrowError('Invalid STYNX preference defaults');

    const service = new PreferencesService(
      { get } as never,
      store,
      {},
      { write: vi.fn() },
      { resolve: async () => null },
    );
    await service.getPreferences();
    expect(get).toHaveBeenCalledWith(RequestContext, { strict: false });
  });

  it('enforces exact trusted-scope failures and the 255-byte subject boundary', async () => {
    const cases = [
      {
        context: () => {
          throw new Error('context unavailable');
        },
        code: 'PREFERENCES_UNAUTHENTICATED',
        status: 401,
        fields: undefined,
      },
      {
        context: () => ({ tenantId: tenantA, actorId: undefined }),
        code: 'PREFERENCES_UNAUTHENTICATED',
        status: 401,
        fields: undefined,
      },
      {
        context: () => ({ tenantId: undefined, actorId: 'subject' }),
        code: 'PREFERENCES_FORBIDDEN',
        status: 403,
        fields: undefined,
      },
      {
        context: () => ({ tenantId: tenantA, actorId: 'x'.repeat(256) }),
        code: 'PREFERENCES_INVALID',
        status: 400,
        fields: ['subject'],
      },
    ];

    for (const entry of cases) {
      const service = new PreferencesService(
        { get: entry.context } as never,
        new InMemoryPreferencesStore(),
        {},
        { write: vi.fn() },
        { resolve: async () => null },
      );
      const error = await preferencesError(service.getPreferences());
      expect(error.getStatus()).toBe(entry.status);
      expect(error.getResponse()).toEqual({
        code: entry.code,
        message: entry.code,
        ...(entry.fields ? { fields: entry.fields } : {}),
      });
    }

    const boundary = harness(tenantA, 'x'.repeat(255));
    await expect(boundary.service.getPreferences()).resolves.toMatchObject({ revision: 0 });
  });

  it('covers absent stored optionals and explicit undefined patch fallbacks', async () => {
    const empty = harness();
    await expect(empty.service.getProfile()).resolves.toMatchObject({
      displayName: null,
      avatarDocumentId: null,
      revision: 0,
      updatedAt: null,
    });
    await expect(
      empty.service.patchPreferences({ theme: { density: 'compact' } }, 0),
    ).resolves.toMatchObject({ revision: 1 });

    const reset = harness();
    await expect(reset.service.reset(null, 0)).resolves.toMatchObject({ revision: 0 });
    await expect(reset.service.patchProfile('invalid', 0)).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'PREFERENCES_INVALID',
    );

    const existing = harness();
    await existing.service.patchProfile({ avatarDocumentId: 'avatar-1' }, 0);
    await expect(existing.service.patchProfile({ displayName: 'Ada' }, 1)).resolves.toMatchObject({
      avatarDocumentId: 'avatar-1',
      displayName: 'Ada',
      revision: 2,
    });
    await expect(
      existing.service.patchPreferences({ theme: undefined } as never, 2),
    ).resolves.toMatchObject({ revision: 2 });
  });
});
