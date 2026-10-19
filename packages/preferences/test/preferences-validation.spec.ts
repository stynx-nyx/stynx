import { describe, expect, it, vi } from 'vitest';
import { PreferencesService } from '../src/preferences.service.js';
import {
  harness,
  tenantA,
  changed,
  preferencesError,
  errorCode,
} from './support/preferences-harness.js';

describe('preferences closed validation and configured values', () => {
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

  it('rejects oversized documents and unsupported configured values without persistence', async () => {
    const { context, store } = harness();
    const service = new PreferencesService(
      { get: () => context } as never,
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

  it('reports exact invalid fields for full values, patches, and profiles', async () => {
    const { service } = harness();
    const invalidValue = await preferencesError(
      service.putPreferences({ ...changed, theme: { ...changed.theme, density: 'wide' } }, 0),
    );
    expect(invalidValue.getStatus()).toBe(400);
    expect(invalidValue.getResponse()).toEqual({
      code: 'PREFERENCES_INVALID',
      message: 'PREFERENCES_INVALID',
      fields: ['theme.density'],
    });

    const invalidPatch = await preferencesError(service.patchPreferences({}, 0));
    expect(invalidPatch.getResponse()).toEqual({
      code: 'PREFERENCES_INVALID',
      message: 'PREFERENCES_INVALID',
      fields: [''],
    });

    const invalidProfile = await preferencesError(service.patchProfile({ displayName: '' }, 0));
    expect(invalidProfile.getResponse()).toEqual({
      code: 'PREFERENCES_INVALID',
      message: 'PREFERENCES_INVALID',
      fields: ['displayName'],
    });

    const forbiddenProfile = await preferencesError(service.patchProfile({ salary: 1 }, 0));
    expect(forbiddenProfile.getResponse()).toEqual({
      code: 'PREFERENCES_FORBIDDEN_FIELD',
      message: 'PREFERENCES_FORBIDDEN_FIELD',
      fields: ['salary'],
    });
  });

  it('enforces empty profile patches and avatar document byte boundaries', async () => {
    const { service } = harness();
    for (const raw of [{}, { avatarDocumentId: 'x'.repeat(256) }]) {
      const error = await preferencesError(service.patchProfile(raw, 0));
      expect(error.getResponse()).toMatchObject({ code: 'PREFERENCES_INVALID' });
    }
    await expect(
      service.patchProfile({ avatarDocumentId: 'x'.repeat(255) }, 0),
    ).resolves.toMatchObject({ avatarDocumentId: 'x'.repeat(255), revision: 1 });
  });

  it('checks configured locale and timezone allowlists independently', async () => {
    const build = (supportedLocales?: string[], supportedTimezones?: string[]) => {
      const { context, store } = harness();
      return new PreferencesService(
        { get: () => context } as never,
        store,
        { supportedLocales, supportedTimezones },
        { write: vi.fn() },
        { resolve: async () => null },
      );
    };
    const localeError = await preferencesError(
      build(['en-US'], ['America/Sao_Paulo']).putPreferences(changed, 0),
    );
    expect(localeError.getResponse()).toEqual({
      code: 'PREFERENCES_INVALID',
      message: 'PREFERENCES_INVALID',
      fields: ['locale.locale'],
    });
    const timezoneError = await preferencesError(
      build(['pt-BR'], ['UTC']).putPreferences(changed, 0),
    );
    expect(timezoneError.getResponse()).toEqual({
      code: 'PREFERENCES_INVALID',
      message: 'PREFERENCES_INVALID',
      fields: ['locale.timezone'],
    });
    await expect(
      build(['pt-BR'], ['America/Sao_Paulo']).putPreferences(changed, 0),
    ).resolves.toMatchObject({ revision: 1 });
  });

  it('rejects cyclic JSON and enforces the serialized-size boundary exactly', async () => {
    const { service } = harness();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const cyclicError = await preferencesError(service.patchProfile(cyclic, 0));
    expect(cyclicError.getResponse()).toEqual({
      code: 'PREFERENCES_INVALID',
      message: 'PREFERENCES_INVALID',
    });

    const exact = { displayName: 'x'.repeat(16 * 1024 - 18) };
    expect(Buffer.byteLength(JSON.stringify(exact))).toBe(16 * 1024);
    const schemaError = await preferencesError(service.patchProfile(exact, 0));
    expect(schemaError.getStatus()).toBe(400);

    const oversized = { displayName: 'x'.repeat(16 * 1024 - 17) };
    expect(Buffer.byteLength(JSON.stringify(oversized))).toBe(16 * 1024 + 1);
    const sizeError = await preferencesError(service.patchProfile(oversized, 0));
    expect(sizeError.getStatus()).toBe(413);
    expect(sizeError.getResponse()).toEqual({
      code: 'PREFERENCES_TOO_LARGE',
      message: 'PREFERENCES_TOO_LARGE',
    });
  });
});
