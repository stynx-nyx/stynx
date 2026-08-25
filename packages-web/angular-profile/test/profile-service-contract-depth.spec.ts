import '@angular/compiler';
import { HttpClient } from '@angular/common/http';
import { Injector, NgZone, runInInjectionContext } from '@angular/core';
import { STYNX_ANGULAR_OPTIONS } from '@stynx-nyx/angular';
import { DocumentService, STYNX_UPLOAD_EXECUTOR } from '@stynx-nyx/angular-storage';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ProfileService } from '../src/profile.service';
import { provideStynxProfile } from '../src/provide-profile';
import { STYNX_PROFILE_CLIENT } from '../src/tokens';
import { UnsavedChangesGuard, UnsavedChangesRegistry, unsavedChangesGuard } from '../src/unsaved-changes.guard';
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

  it('uses HttpClient fallbacks, exact revisions, and preserves an absent embedded preference', async () => {
    const profile = {
      subjectId: 'subject-http',
      displayName: 'HTTP Profile',
      avatarDocumentId: null,
      avatarUrl: null,
      preferences: null,
      revision: 2,
      updatedAt: '2026-07-13T00:00:00.000Z',
    } as StynxProfile;
    const preferences: StynxPreferences = {
      values: {
        locale: { locale: 'en-US', timezone: 'UTC' },
        theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable' },
        accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
        notificationDelivery: { email: true, push: false, inApp: true },
      },
      revision: 3,
      updatedAt: '2026-07-13T00:01:00.000Z',
    };
    const http = {
      get: vi.fn(() => of(profile)),
      patch: vi.fn(() => of({ ...profile, displayName: 'Patched' })),
      put: vi.fn(() => of(preferences)),
    };
    const injector = Injector.create({
      providers: [
        { provide: HttpClient, useValue: http },
        { provide: STYNX_ANGULAR_OPTIONS, useValue: { apiBaseUrl: 'https://api.example.test///' } },
      ],
    });
    const service = runInInjectionContext(injector, () => new ProfileService());

    await firstValueFrom(service.reload());
    await firstValueFrom(service.patch({ displayName: 'Patched' }));
    service.profile.set(null);
    await firstValueFrom(service.setPreferences(preferences.values));

    expect(http.get).toHaveBeenCalledWith('https://api.example.test/profile');
    expect(http.patch).toHaveBeenCalledWith('https://api.example.test/profile', { displayName: 'Patched' }, {
      headers: { 'If-Match': '"2"' },
    });
    expect(http.put).toHaveBeenCalledWith('https://api.example.test/profile/preferences', preferences.values, {
      headers: { 'If-Match': '"0"' },
    });
    expect(service.profile()).toBeNull();
  });

  it('uploads avatars through storage and updates an existing profile', async () => {
    const upload = vi.fn(async (_url, _file, _headers, progress: (value: number) => void) => progress(100));
    const documents = {
      initiate: vi.fn(async () => ({
        id: 'avatar-1',
        s3Key: 'avatars/avatar-1',
        upload: { method: 'PUT', url: 'https://upload.example.test/avatar', headers: { 'x-test': '1' }, expiresInSeconds: 60 },
      })),
      complete: vi.fn(async () => ({ id: 'avatar-1', scanStatus: 'completed' })),
      getDownloadUrl: vi.fn(async () => ({ id: 'avatar-1', url: 'https://cdn.example.test/avatar-1', expiresInSeconds: 60 })),
    };
    const service = runInInjectionContext(Injector.create({ providers: [
      { provide: DocumentService, useValue: documents },
      { provide: STYNX_UPLOAD_EXECUTOR, useValue: { upload } },
    ] }), () => new ProfileService());
    service.profile.set({
      subjectId: 'subject-1', displayName: 'Ada', avatarDocumentId: null, avatarUrl: null,
      preferences: null, revision: 1, updatedAt: '2026-07-13T00:00:00.000Z',
    });
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });

    await expect(firstValueFrom(service.uploadAvatar(file))).resolves.toEqual({ url: 'https://cdn.example.test/avatar-1' });
    expect(documents.initiate).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'avatars', filename: 'avatar.png', mimeType: 'image/png', byteSize: 6,
    }));
    expect(service.profile()).toMatchObject({
      avatarDocumentId: 'avatar-1', avatarUrl: 'https://cdn.example.test/avatar-1',
    });
  });

  it('fails closed when required HTTP, Angular, or storage providers are absent', async () => {
    const service = runInInjectionContext(Injector.create({ providers: [] }), () => new ProfileService());

    expect(() => service.reload()).toThrow('ProfileService requires HttpClient');
    await expect(firstValueFrom(service.uploadAvatar(new File([], 'avatar.png'))))
      .rejects.toThrow('Avatar upload requires @stynx-nyx/angular-storage providers.');

    const httpOnly = runInInjectionContext(Injector.create({ providers: [
      { provide: HttpClient, useValue: { get: vi.fn() } },
    ] }), () => new ProfileService());
    expect(() => httpOnly.reload()).toThrow('ProfileService requires provideStynxProfile');
    expect(provideStynxProfile({ clientFactory: vi.fn() })).toEqual(expect.anything());
  });

  it('tracks unsaved registrations and delegates guard confirmation paths', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const registry = runInInjectionContext(Injector.create({ providers: [
      { provide: NgZone, useValue: { runOutsideAngular: (fn: () => void) => fn() } },
    ] }), () => new UnsavedChangesRegistry());
    const clean = { hasUnsavedChanges: () => false };
    const dirty = { hasUnsavedChanges: () => true };
    const unregisterClean = registry.register(clean);
    const unregisterDirty = registry.register(dirty);
    expect(addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(registry.hasUnsavedChanges()).toBe(true);
    unregisterDirty();
    expect(registry.hasUnsavedChanges()).toBe(false);
    unregisterClean();

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const injector = Injector.create({ providers: [
      { provide: StynxI18nService, useValue: { translate: () => 'Discard changes?' } },
      UnsavedChangesGuard,
    ] });
    const guard = injector.get(UnsavedChangesGuard);
    expect(guard.canDeactivate(clean)).toBe(true);
    expect(guard.canDeactivate({ hasUnsavedChanges: () => true, confirmDiscardChanges: () => true })).toBe(true);
    expect(guard.canDeactivate(dirty)).toBe(false);
    expect(confirm).toHaveBeenCalledWith('Discard changes?');
    expect(runInInjectionContext(injector, () => unsavedChangesGuard(clean, {} as never, {} as never, {} as never)))
      .toBe(true);
  });
});
