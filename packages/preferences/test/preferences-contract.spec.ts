import { describe, expect, it, vi } from 'vitest';
import { RequestContext } from '@stynx-nyx/core';
import { PreferencesController } from '../src/preferences.controller';
import { PreferencesError } from '../src/errors';
import { InMemoryPreferencesStore } from '../src/in-memory-preferences.store';
import { PostgresPreferencesStore } from '../src/postgres-preferences.store';
import { PLATFORM_PREFERENCE_DEFAULTS } from '../src/schema';
import { PreferencesService } from '../src/preferences.service';
import type { PreferenceValues, PreferencesAuditEvent, PreferencesStore } from '../src/types';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';

function harness(tenantId = tenantA, subjectId = 'external|subject-1') {
  const context = { tenantId, actorId: subjectId, requestId: 'request-1' };
  const store = new InMemoryPreferencesStore();
  const events: PreferencesAuditEvent[] = [];
  const service = new PreferencesService(
    { get: () => context } as never,
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

async function preferencesError(operation: Promise<unknown>): Promise<PreferencesError> {
  let captured: unknown;
  try {
    await operation;
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(PreferencesError);
  return captured as PreferencesError;
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

  it('routes every controller operation through trusted scope, strong revision, and ETag', async () => {
    const profile = {
      subjectId: 'subject-1',
      displayName: null,
      avatarDocumentId: null,
      avatarUrl: null,
      preferences: { values: PLATFORM_PREFERENCE_DEFAULTS, revision: 7, updatedAt: null },
      revision: 7,
      updatedAt: null,
    };
    const preferences = {
      values: PLATFORM_PREFERENCE_DEFAULTS,
      revision: 7,
      updatedAt: null,
    };
    const service = {
      getProfile: vi.fn(async () => profile),
      patchProfile: vi.fn(async () => profile),
      getPreferences: vi.fn(async () => preferences),
      putPreferences: vi.fn(async () => preferences),
      patchPreferences: vi.fn(async () => preferences),
      reset: vi.fn(async () => preferences),
    };
    const controller = new PreferencesController(service as never);
    const response = { setHeader: vi.fn() };
    const request = { tenantId: tenantA, stynxClaims: { sub: 'subject-1' } };

    await expect(controller.profile({}, response, request)).resolves.toBe(profile);
    await expect(
      controller.patchProfile({ displayName: 'Ada' }, {}, '"7"', response, request),
    ).resolves.toBe(profile);
    await expect(controller.get({}, response, request)).resolves.toBe(preferences);
    await expect(controller.put(changed, {}, '"7"', response, request)).resolves.toBe(preferences);
    await expect(
      controller.patch({ theme: { density: 'compact' } }, {}, '"7"', response, request),
    ).resolves.toBe(preferences);
    await expect(controller.reset({}, '"7"', response, request)).resolves.toBe(preferences);
    await expect(controller.resetCategory('theme', {}, '"7"', response, request)).resolves.toBe(
      preferences,
    );

    const scope = { tenantId: tenantA, subjectId: 'subject-1' };
    expect(service.getProfile).toHaveBeenCalledWith(scope);
    expect(service.patchProfile).toHaveBeenCalledWith({ displayName: 'Ada' }, 7, scope);
    expect(service.getPreferences).toHaveBeenCalledWith(scope);
    expect(service.putPreferences).toHaveBeenCalledWith(changed, 7, scope);
    expect(service.patchPreferences).toHaveBeenCalledWith(
      { theme: { density: 'compact' } },
      7,
      scope,
    );
    expect(service.reset).toHaveBeenNthCalledWith(1, null, 7, scope);
    expect(service.reset).toHaveBeenNthCalledWith(2, 'theme', 7, scope);
    expect(response.setHeader).toHaveBeenCalledTimes(7);
    expect(response.setHeader).toHaveBeenLastCalledWith('ETag', '"7"');
  });

  it('accepts each trusted controller subject source and rejects incomplete scope or unsafe tags', async () => {
    const service = {
      getPreferences: vi.fn(async () => ({
        values: PLATFORM_PREFERENCE_DEFAULTS,
        revision: 0,
        updatedAt: null,
      })),
    };
    const controller = new PreferencesController(service as never);
    const response = { setHeader: vi.fn() };
    const requests = [
      { tenantId: tenantA, principal: { id: 'principal-1' } },
      { tenantId: tenantA, actor: { id: 'actor-1' } },
      { tenantId: tenantA, user: { id: 'user-1' } },
      { stynxClaims: { sub: 'claims-1', tenantId: tenantA } },
    ];
    for (const request of requests) await controller.get({}, response, request);
    expect(service.getPreferences.mock.calls.map(([scope]) => scope)).toEqual([
      { tenantId: tenantA, subjectId: 'principal-1' },
      { tenantId: tenantA, subjectId: 'actor-1' },
      { tenantId: tenantA, subjectId: 'user-1' },
      { tenantId: tenantA, subjectId: 'claims-1' },
    ]);

    for (const [request, code] of [
      [{ tenantId: tenantA }, 'PREFERENCES_UNAUTHENTICATED'],
      [{ user: { id: 'subject-1' } }, 'PREFERENCES_FORBIDDEN'],
      [{ tenantId: tenantA, user: { id: 'x'.repeat(256) } }, 'PREFERENCES_INVALID'],
    ] as const) {
      await expect(controller.get({}, response, request)).rejects.toSatisfy(
        (error: unknown) => errorCode(error) === code,
      );
    }
    await expect(
      controller.reset({}, '"9007199254740992"', response, requests[0]),
    ).rejects.toSatisfy((error: unknown) => errorCode(error) === 'PREFERENCES_REVISION_CONFLICT');
  });

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
