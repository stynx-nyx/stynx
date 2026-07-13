import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProfileService } from '../src/profile.service';
import { STYNX_PROFILE_CLIENT } from '../src/tokens';
import type { StynxPreferences, StynxProfile } from '../src/types';

function createService(client: StynxSdkClient): ProfileService {
  const injector = Injector.create({
    providers: [{ provide: STYNX_PROFILE_CLIENT, useValue: client }],
  });
  return runInInjectionContext(injector, () => new ProfileService());
}

describe('@stynx-nyx/angular-profile W04 profile service contract depth', () => {
  it('reads profile state from the configured client and mirrors embedded preferences', async () => {
    const profile: StynxProfile = {
      subjectId: 'subject-1',
      displayName: 'Ada Lovelace',
      avatarDocumentId: null,
      avatarUrl: null,
      preferences: {
        values: {
          locale: { locale: 'en-US', timezone: 'America/Sao_Paulo' },
          theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable' },
          accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
          notificationDelivery: { email: true, push: true, inApp: true },
        },
        revision: 7,
        updatedAt: '2026-07-13T00:00:00.000Z',
      },
      revision: 7,
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const client = {
      get: vi.fn(async () => profile),
      patch: vi.fn(),
      put: vi.fn(),
    } as unknown as StynxSdkClient;
    const service = createService(client);

    await expect(firstValueFrom(service.reload())).resolves.toEqual(profile);

    expect(client.get).toHaveBeenCalledWith('/profile');
    expect(service.profile()).toEqual(profile);
    expect(service.preferences()).toEqual(profile.preferences);
  });

  it('submits exact profile and preference update shapes to the configured client', async () => {
    const patched: StynxProfile = {
      subjectId: 'subject-1',
      displayName: 'Ada Byron',
      avatarDocumentId: null,
      avatarUrl: null,
      preferences: {
        values: {
          locale: { locale: 'pt-BR', timezone: 'America/Sao_Paulo' },
          theme: { colorScheme: 'dark', contrast: 'standard', density: 'compact' },
          accessibility: { reduceMotion: true, largeText: false, screenReaderOptimized: false },
          notificationDelivery: { email: false, push: true, inApp: true },
        },
        revision: 4,
        updatedAt: '2026-07-13T00:00:00.000Z',
      },
      revision: 4,
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    const preferences: StynxPreferences = {
      values: patched.preferences.values,
      revision: 5,
      updatedAt: '2026-07-13T00:01:00.000Z',
    };
    const client = {
      get: vi.fn(),
      patch: vi.fn(async () => patched),
      put: vi.fn(async () => preferences),
    } as unknown as StynxSdkClient;
    const service = createService(client);

    await expect(firstValueFrom(service.patch({ displayName: 'Ada Byron' }))).resolves.toEqual(
      patched,
    );
    await expect(firstValueFrom(service.setPreferences(preferences.values))).resolves.toEqual(
      preferences,
    );

    expect(client.patch).toHaveBeenCalledWith(
      '/profile',
      {
        displayName: 'Ada Byron',
      },
      {
        headers: { 'If-Match': '"0"' },
      },
    );
    expect(client.put).toHaveBeenCalledWith('/profile/preferences', preferences.values, {
      headers: { 'If-Match': '"4"' },
    });
    expect(service.profile()).toEqual({ ...patched, preferences });
    expect(service.preferences()).toEqual(preferences);
  });
});
