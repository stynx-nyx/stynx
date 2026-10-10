import { describe, expect, it, vi } from 'vitest';
import { PreferencesService } from '../src/preferences.service';
import { PLATFORM_PREFERENCE_DEFAULTS } from '../src/schema';
import type { PreferencesStore } from '../src/types';
import { harness, tenantA, changed, preferencesError } from './support/preferences-harness';

describe('preferences atomic mutations and redacted audit', () => {
  it('supports atomic patch/null reset/all reset and deterministic exact no-op', async () => {
    const { service, events } = harness();
    const first = await service.putPreferences(changed, 0);
    const patched = await service.patchPreferences(
      { theme: { contrast: null }, accessibility: { reduceMotion: true } },
      1,
    );
    expect(patched.revision).toBe(2);
    expect(patched.values.theme.contrast).toBe('standard');
    expect(patched.values.accessibility.reduceMotion).toBe(true);
    const reset = await service.reset(null, 2);
    expect(reset.values).toEqual(PLATFORM_PREFERENCE_DEFAULTS);
    expect(reset.revision).toBe(3);
    const noOp = await service.reset(null, 3);
    expect(noOp.revision).toBe(3);
    expect(events).toHaveLength(3);
    expect(first.revision).toBe(1);
  });

  it('permits only one same-revision writer and redacts audit values', async () => {
    const { service, events } = harness();
    const results = await Promise.allSettled([
      service.putPreferences(changed, 0),
      service.putPreferences({ ...changed, locale: { locale: 'fr-FR', timezone: 'UTC' } }, 0),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('pt-BR');
    expect(JSON.stringify(events)).not.toContain('America/Sao_Paulo');
    expect(events[0]).toMatchObject({
      tenantId: tenantA,
      subjectId: 'external|subject-1',
      previousRevision: 0,
      newRevision: 1,
    });
  });

  it('records precise full-update and patch paths while dropping default-valued overrides', async () => {
    const { service, store, events } = harness();
    await service.putPreferences(changed, 0);
    expect(events[0]).toMatchObject({
      operation: 'preferences.updated',
      changedPaths: [
        'locale.locale',
        'locale.timezone',
        'theme.colorScheme',
        'theme.contrast',
        'theme.density',
      ],
    });
    expect(
      (await store.read({ tenantId: tenantA, subjectId: 'external|subject-1' }))?.overrides,
    ).toEqual({ locale: changed.locale, theme: changed.theme });

    await service.patchPreferences(
      { locale: null, theme: { colorScheme: null }, notificationDelivery: { email: false } },
      1,
    );
    expect(events[1]).toMatchObject({
      operation: 'preferences.updated',
      changedPaths: ['locale', 'theme.colorScheme', 'notificationDelivery.email'],
    });
    expect(
      (await store.read({ tenantId: tenantA, subjectId: 'external|subject-1' }))?.overrides,
    ).toEqual({
      theme: { contrast: 'more', density: 'compact' },
      notificationDelivery: { email: false },
    });
  });

  it('resets one category with its exact audit operation and rejects unknown categories', async () => {
    const { service, events } = harness();
    await service.putPreferences(changed, 0);
    const reset = await service.reset('theme', 1);
    expect(reset.values.theme).toEqual(PLATFORM_PREFERENCE_DEFAULTS.theme);
    expect(reset.values.locale).toEqual(changed.locale);
    expect(events[1]).toMatchObject({
      operation: 'preferences.category_reset',
      changedPaths: ['theme'],
      previousRevision: 1,
      newRevision: 2,
    });

    const error = await preferencesError(service.reset('unknown' as never, 2));
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual({
      code: 'PREFERENCES_CATEGORY_NOT_FOUND',
      message: 'PREFERENCES_CATEGORY_NOT_FOUND',
      fields: ['category'],
    });
  });

  it('patches profile fields independently, resolves avatars, and audits exact paths', async () => {
    const { service, events } = harness();
    const named = await service.patchProfile({ displayName: ' Ada ' }, 0);
    expect(named).toMatchObject({
      subjectId: 'external|subject-1',
      displayName: 'Ada',
      avatarDocumentId: null,
      avatarUrl: null,
      revision: 1,
    });
    const avatar = await service.patchProfile({ avatarDocumentId: 'avatar-1' }, 1);
    expect(avatar).toMatchObject({
      displayName: 'Ada',
      avatarDocumentId: 'avatar-1',
      avatarUrl: 'signed:avatar-1',
      revision: 2,
    });
    expect(events).toMatchObject([
      { operation: 'profile.updated', changedPaths: ['displayName'] },
      { operation: 'profile.updated', changedPaths: ['avatarDocumentId'] },
    ]);
  });

  it('distinguishes stale reads from compare-and-set conflicts', async () => {
    const stale = harness();
    const staleError = await preferencesError(stale.service.putPreferences(changed, 1));
    expect(staleError.getResponse()).toEqual({
      code: 'PREFERENCES_REVISION_CONFLICT',
      message: 'PREFERENCES_REVISION_CONFLICT',
    });

    const conflictStore: PreferencesStore = {
      read: async () => null,
      compareAndSet: async () => 'conflict',
    };
    const service = new PreferencesService(
      { get: () => ({ tenantId: tenantA, actorId: 'subject' }) } as never,
      conflictStore,
      {},
      { write: vi.fn() },
      { resolve: async () => null },
    );
    const mutationConflict = await preferencesError(service.putPreferences(changed, 0));
    expect(mutationConflict.getStatus()).toBe(412);
    const profileConflict = await preferencesError(service.patchProfile({ displayName: 'Ada' }, 0));
    expect(profileConflict.getStatus()).toBe(412);
  });

  it('removes the final preference override leaf and records the exact patch path', async () => {
    const { service, events } = harness();
    const values = structuredClone(PLATFORM_PREFERENCE_DEFAULTS);
    values.notificationDelivery.email = false;
    await service.putPreferences(values, 0);
    await expect(
      service.patchPreferences({ notificationDelivery: { email: null } }, 1),
    ).resolves.toMatchObject({ values: PLATFORM_PREFERENCE_DEFAULTS, revision: 2 });
    expect(events[1]).toMatchObject({
      operation: 'preferences.updated',
      changedPaths: ['notificationDelivery.email'],
    });
  });
});
