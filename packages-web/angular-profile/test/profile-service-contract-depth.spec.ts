import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import type { StynxSdkClient } from '@stynx-web/sdk';
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

describe('@stynx-web/angular-profile W04 profile service contract depth', () => {
  it('reads profile state from the configured client and mirrors embedded preferences', async () => {
    const profile: StynxProfile = {
      id: 'profile-1',
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      locale: 'en-US',
      preferences: {
        locale: 'en-US',
        notifications: true,
        timezone: 'America/Sao_Paulo',
      },
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
      id: 'profile-1',
      name: 'Ada Byron',
      email: 'ada@example.test',
      locale: 'pt-BR',
      preferences: {
        locale: 'pt-BR',
        notifications: false,
      },
    };
    const preferences: StynxPreferences = {
      locale: 'pt-BR',
      notifications: false,
      timezone: 'America/Sao_Paulo',
    };
    const client = {
      get: vi.fn(),
      patch: vi.fn(async () => patched),
      put: vi.fn(async () => preferences),
    } as unknown as StynxSdkClient;
    const service = createService(client);

    await expect(firstValueFrom(service.patch({
      displayName: 'Ada Byron',
      name: 'Ada Byron',
      email: 'ada@example.test',
      locale: 'pt-BR',
    }))).resolves.toEqual(patched);
    await expect(firstValueFrom(service.setPreferences(preferences))).resolves.toEqual(preferences);

    expect(client.patch).toHaveBeenCalledWith('/profile', {
      displayName: 'Ada Byron',
      name: 'Ada Byron',
      email: 'ada@example.test',
      locale: 'pt-BR',
    });
    expect(client.put).toHaveBeenCalledWith('/profile/preferences', {
      locale: 'pt-BR',
      notifications: false,
      timezone: 'America/Sao_Paulo',
    });
    expect(service.profile()).toEqual({ ...patched, preferences });
    expect(service.preferences()).toEqual(preferences);
  });
});
