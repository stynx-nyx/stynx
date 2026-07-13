import { describe, expect, it, vi } from 'vitest';
import { PreferencesController } from '../src/preferences.controller';
import { PreferencesError } from '../src/errors';
import { InMemoryPreferencesStore } from '../src/in-memory-preferences.store';
import { PLATFORM_PREFERENCE_DEFAULTS } from '../src/schema';
import { PreferencesService } from '../src/preferences.service';
import type { PreferenceValues, PreferencesAuditEvent } from '../src/types';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';

function harness(tenantId = tenantA, subjectId = 'external|subject-1') {
  const context = { tenantId, actorId: subjectId, requestId: 'request-1' };
  const store = new InMemoryPreferencesStore();
  const events: PreferencesAuditEvent[] = [];
  const service = new PreferencesService(
    context as never,
    store,
    {},
    { write: (event) => events.push(event) },
    { resolve: async (id) => (id ? `signed:${id}` : null) },
  );
  return { context, store, events, service, controller: new PreferencesController(service) };
}

const changed: PreferenceValues = {
  ...structuredClone(PLATFORM_PREFERENCE_DEFAULTS),
  locale: { locale: 'pt-BR', timezone: 'America/Sao_Paulo' },
  theme: { colorScheme: 'dark', contrast: 'more', density: 'compact' },
};

function errorCode(error: unknown): string | undefined {
  return error instanceof PreferencesError ? error.code : undefined;
}

describe('@stynx-nyx/preferences W04 closed contract', () => {
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

  it.each([
    [{ ...changed, payroll: { salary: 1 } }, 'PREFERENCES_INVALID'],
    [{ ...changed, locale: { ...changed.locale, cpf: '123' } }, 'PREFERENCES_INVALID'],
    [{ ...changed, theme: { ...changed.theme, colorScheme: 'neon' } }, 'PREFERENCES_INVALID'],
    [{ locale: [] }, 'PREFERENCES_INVALID'],
    [{}, 'PREFERENCES_INVALID'],
  ])('rejects closed-schema adversarial payload %j', async (payload, code) => {
    const { service, store } = harness();
    await expect(service.putPreferences(payload, 0)).rejects.toSatisfy(
      (e: unknown) => errorCode(e) === code,
    );
    expect(await store.read({ tenantId: tenantA, subjectId: 'external|subject-1' })).toEqual(null);
  });

  it('rejects profile mass assignment and never audits rejected values', async () => {
    const { service, events, store } = harness();
    await expect(
      service.patchProfile({ displayName: 'Ada', salary: 999, cpf: 'secret' }, 0),
    ).rejects.toSatisfy((e: unknown) => errorCode(e) === 'PREFERENCES_FORBIDDEN_FIELD');
    expect(events).toEqual([]);
    expect(JSON.stringify(events)).not.toContain('secret');
    expect(await store.read({ tenantId: tenantA, subjectId: 'external|subject-1' })).toEqual(null);
  });

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

  it('enforces strong If-Match and rejects every identity override spelling before service calls', async () => {
    const service = {
      getProfile: vi.fn(),
      patchProfile: vi.fn(),
      getPreferences: vi.fn(),
      putPreferences: vi.fn(),
      patchPreferences: vi.fn(),
      reset: vi.fn(),
    };
    const controller = new PreferencesController(service as never);
    const response = { setHeader: vi.fn() };
    for (const tag of [undefined, '*', 'W/"0"', '"0", "1"', '0', '"01"']) {
      await expect(controller.put(changed, {}, tag, response)).rejects.toSatisfy(
        (e: unknown) =>
          errorCode(e) ===
          (tag === undefined
            ? 'PREFERENCES_PRECONDITION_REQUIRED'
            : 'PREFERENCES_REVISION_CONFLICT'),
      );
    }
    for (const key of ['tenantId', 'tenant_id', 'subjectId', 'subject_id', 'userId', 'user_id']) {
      await expect(
        controller.put({ ...changed, [key]: 'spoof' }, {}, '"0"', response),
      ).rejects.toSatisfy((e: unknown) => errorCode(e) === 'PREFERENCES_CONTEXT_OVERRIDE');
      await expect(controller.get({ [key]: 'spoof' }, response)).rejects.toSatisfy(
        (e: unknown) => errorCode(e) === 'PREFERENCES_CONTEXT_OVERRIDE',
      );
    }
    expect(service.putPreferences).not.toHaveBeenCalled();
    expect(service.getPreferences).not.toHaveBeenCalled();
  });

  it('rejects oversized documents and unsupported configured values without persistence', async () => {
    const { context, store } = harness();
    const service = new PreferencesService(
      context as never,
      store,
      { supportedLocales: ['en-US'], supportedTimezones: ['UTC'] },
      { write: vi.fn() },
      { resolve: async () => null },
    );
    await expect(service.putPreferences(changed, 0)).rejects.toSatisfy(
      (e: unknown) => errorCode(e) === 'PREFERENCES_INVALID',
    );
    await expect(service.patchProfile({ displayName: 'x'.repeat(17_000) }, 0)).rejects.toSatisfy(
      (e: unknown) => errorCode(e) === 'PREFERENCES_TOO_LARGE',
    );
    expect(await store.read({ tenantId: tenantA, subjectId: 'external|subject-1' })).toEqual(null);
  });
});
