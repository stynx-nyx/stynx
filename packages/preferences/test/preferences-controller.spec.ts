import { describe, expect, it, vi } from 'vitest';
import { PreferencesController } from '../src/preferences.controller';
import { PLATFORM_PREFERENCE_DEFAULTS } from '../src/schema';
import { tenantA, changed, errorCode } from './support/preferences-harness';

describe('preferences controller trusted identity and revision contract', () => {
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
});
