import '@angular/compiler';
import { FormBuilder } from '@angular/forms';
import { Injector, NgZone, runInInjectionContext } from '@angular/core';
import { ErrorBannerService } from '@stynx-nyx/angular';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { STYNX_OIDC_ADAPTER } from '@stynx-nyx/angular-auth';
import { of, throwError } from 'rxjs';
import {
  HostedAuthActionHandoffController,
  StynxChangePasswordHandoffComponent,
  StynxMfaEnrolmentHandoffComponent,
} from '../src/hosted-auth-action-handoff.component';
import { StynxPreferencesFormComponent } from '../src/preferences-form.component';
import { StynxProfileFormComponent } from '../src/profile-form.component';
import { ProfileService } from '../src/profile.service';
import { UnsavedChangesGuard, UnsavedChangesRegistry } from '../src/unsaved-changes.guard';
import type { StynxPreferences, StynxProfile } from '../src/types';

const preferences: StynxPreferences = {
  values: {
    locale: { locale: 'pt-BR', timezone: 'UTC' },
    theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable' },
    accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
    notificationDelivery: { email: true, push: true, inApp: true },
  },
  revision: 1,
  updatedAt: '2026-08-25T12:00:00.000Z',
};
const profile: StynxProfile = {
  subjectId: 'subject-1',
  displayName: 'Ada',
  avatarDocumentId: null,
  avatarUrl: null,
  preferences,
  revision: 1,
  updatedAt: '2026-08-25T12:00:00.000Z',
};

function injector(providers: Array<{ provide: unknown; useValue: unknown }> = []) {
  return Injector.create({
    providers: [
      { provide: FormBuilder, useValue: new FormBuilder() },
      { provide: NgZone, useValue: { runOutsideAngular: (fn: () => void) => fn() } },
      ...providers,
    ] as never,
  });
}

describe('hosted auth handoff behavior', () => {
  it('refreshes ready links, forwards complete context, and uses adapter open', () => {
    const adapter = {
      getHostedActionLink: vi.fn(() => ({ url: 'https://auth.example.test/action' })),
      openHostedAction: vi.fn(),
    };
    const controller = runInInjectionContext(
      injector([{ provide: STYNX_OIDC_ADAPTER, useValue: adapter }]),
      () => new HostedAuthActionHandoffController('change-password'),
    );
    controller.returnUrl = 'https://app.example.test/return';
    controller.state = 'state-1';
    controller.tenantId = 'tenant-1';
    controller.locale = 'pt-BR';
    controller.refresh();
    controller.open();
    expect(controller.labelKey).toBe('profile.security.changePassword.action');
    expect(adapter.openHostedAction).toHaveBeenCalledWith('change-password', {
      returnUrl: controller.returnUrl,
      state: 'state-1',
      tenantId: 'tenant-1',
      locale: 'pt-BR',
    });
  });

  it('marks unavailable and configuration failures and falls back to browser navigation', () => {
    const unavailable = runInInjectionContext(
      injector([{ provide: STYNX_OIDC_ADAPTER, useValue: { getHostedActionLink: () => null } }]),
      () => new HostedAuthActionHandoffController('mfa-enrolment'),
    );
    unavailable.open();
    expect(unavailable.status()).toBe('unavailable');

    const banner = { show: vi.fn() };
    const broken = runInInjectionContext(
      injector([
        {
          provide: STYNX_OIDC_ADAPTER,
          useValue: {
            getHostedActionLink: () => {
              throw new Error('bad config');
            },
          },
        },
        { provide: ErrorBannerService, useValue: banner },
        {
          provide: StynxI18nService,
          useValue: { translate: (key: string) => `translated:${key}` },
        },
      ]),
      () => new HostedAuthActionHandoffController('change-password'),
    );
    broken.open();
    expect(broken.status()).toBe('error');
    expect(banner.show).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AUTH:CONFIG:hosted-action-url' }),
    );

    const originalWindow = globalThis.window;
    const assign = vi.fn();
    vi.stubGlobal('window', { location: { href: 'https://app.example.test/current', assign } });
    const browser = runInInjectionContext(
      injector([
        {
          provide: STYNX_OIDC_ADAPTER,
          useValue: { getHostedActionLink: () => ({ url: 'https://auth.example.test/action' }) },
        },
      ]),
      () => new HostedAuthActionHandoffController('change-password'),
    );
    browser.open();
    expect(assign).toHaveBeenCalledWith('https://auth.example.test/action');
    vi.stubGlobal('window', originalWindow);
  });

  it('refreshes every component input setter for both handoff variants', () => {
    const adapter = {
      getHostedActionLink: vi.fn(() => ({ url: 'https://auth.example.test/action' })),
    };
    const created = runInInjectionContext(
      injector([{ provide: STYNX_OIDC_ADAPTER, useValue: adapter }]),
      () => ({
        password: new StynxChangePasswordHandoffComponent(),
        mfa: new StynxMfaEnrolmentHandoffComponent(),
      }),
    );
    for (const component of [created.password, created.mfa]) {
      component.returnUrl = 'https://app.example.test/return';
      component.state = 'state';
      component.tenantId = 'tenant';
      component.locale = 'en-US';
    }
    expect(adapter.getHostedActionLink).toHaveBeenCalledTimes(10);
  });

  it('uses empty return URLs when a browser global is absent', () => {
    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined);
    const adapter = {
      getHostedActionLink: vi.fn(() => ({ url: 'https://auth.example.test/action' })),
    };
    const controller = runInInjectionContext(
      injector([{ provide: STYNX_OIDC_ADAPTER, useValue: adapter }]),
      () => new HostedAuthActionHandoffController('change-password'),
    );
    controller.open();
    expect(adapter.getHostedActionLink).toHaveBeenCalledWith(
      'change-password',
      expect.objectContaining({ returnUrl: '' }),
    );
    vi.stubGlobal('window', originalWindow);
  });
});

describe('profile and preferences form behavior', () => {
  it('handles preference inputs, invalid state, provider-free save, locale transition, and server confirmation', () => {
    const use = vi.fn(async () => {
      throw new Error('locale load');
    });
    const component = runInInjectionContext(
      injector([{ provide: StynxI18nService, useValue: { translate: (key: string) => key, use } }]),
      () => new StynxPreferencesFormComponent(),
    );
    component.value = null;
    component.form.controls.locale.setValue('');
    component.submit();
    expect(component.status()).toBe('error');
    component.form.setValue({ locale: 'pt-BR', notifications: false });
    component.submit();
    expect(component.status()).toBe('saved');
    expect(use).toHaveBeenCalledWith('pt-BR');
    component.submit();
    expect(use).toHaveBeenCalledTimes(1);
    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined);
    expect(component.confirmDiscardChanges()).toBe(true);
    vi.stubGlobal('window', originalWindow);
    component.ngOnDestroy();
  });

  it('saves legacy and wire preferences, preserves existing values, and surfaces provider errors', () => {
    const toast = { push: vi.fn() };
    const banner = { clear: vi.fn(), show: vi.fn() };
    const service = {
      preferences: vi.fn<() => StynxPreferences | undefined>(() => preferences),
      setPreferences: vi.fn((_value: unknown) => of<unknown>(preferences)),
    };
    const component = runInInjectionContext(
      injector([
        { provide: ProfileService, useValue: service },
        { provide: ErrorBannerService, useValue: banner },
        {
          provide: StynxI18nService,
          useValue: { translate: (key: string) => key, use: vi.fn(async () => undefined) },
        },
      ]),
      () => new StynxPreferencesFormComponent(),
    );
    component.value = { locale: '', notifications: false };
    component.value = {} as never;
    component.value = preferences;
    component.form.setValue({ locale: 'en-US', notifications: false });
    component.submit();
    expect(service.setPreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: expect.objectContaining({ locale: 'en-US' }),
        notificationDelivery: { email: false, push: false, inApp: false },
      }),
    );

    service.preferences.mockReturnValue(undefined);
    service.setPreferences.mockReturnValue(of<unknown>({ locale: 'pt-BR', notifications: true }));
    component.form.setValue({ locale: 'pt-BR', notifications: true });
    component.submit();
    service.setPreferences.mockReturnValue(of<unknown>({ locale: 'en-US' }));
    component.form.setValue({ locale: 'en-US', notifications: true });
    component.submit();
    service.setPreferences.mockReturnValue(of<unknown>({ locale: '', notifications: false }));
    component.submit();
    service.setPreferences.mockReturnValue(of<unknown>({}));
    component.submit();
    service.setPreferences.mockReturnValue(throwError(() => new Error('save failed')));
    component.submit();
    expect(component.status()).toBe('error');
    expect(banner.show).toHaveBeenCalled();
    component.ngOnDestroy();

    const untranslated = runInInjectionContext(
      injector(),
      () => new StynxPreferencesFormComponent(),
    );
    untranslated.form.controls.locale.setValue('');
    untranslated.submit();
    expect(untranslated.errorMessage()).toBe('profile.preferences.error.invalid');
  });

  it('handles profile inputs, invalid/provider-free saves, provider success/error, and server confirmation', () => {
    const banner = { clear: vi.fn(), show: vi.fn() };
    const service = { patch: vi.fn(() => of(profile)) };
    const component = runInInjectionContext(
      injector([
        { provide: ProfileService, useValue: service },
        { provide: ErrorBannerService, useValue: banner },
      ]),
      () => new StynxProfileFormComponent(),
    );
    component.value = null;
    component.value = profile;
    component.value = { name: '', email: 'ada@example.test', locale: 'en-US' };
    component.form.controls.email.setValue('bad');
    component.submit();
    expect(component.status()).toBe('error');
    component.form.setValue({ name: 'Ada', email: 'ada@example.test', locale: 'en-US' });
    component.submit();
    expect(service.patch).toHaveBeenCalledWith({ displayName: 'Ada' });
    service.patch.mockReturnValue(throwError(() => new Error('save failed')));
    component.form.setValue({ name: 'Ada', email: 'ada@example.test', locale: 'en-US' });
    component.submit();
    expect(component.status()).toBe('error');
    expect(banner.show).toHaveBeenCalled();
    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined);
    expect(component.confirmDiscardChanges()).toBe(true);
    vi.stubGlobal('window', originalWindow);
    component.ngOnDestroy();
  });
});

describe('unsaved changes beforeunload behavior', () => {
  it('prevents unload only while a registered entry is dirty and covers server registration', () => {
    let listener!: (event: BeforeUnloadEvent) => unknown;
    const addEventListener = vi
      .spyOn(window, 'addEventListener')
      .mockImplementation((type, callback) => {
        if (type === 'beforeunload') listener = callback as never;
      });
    const registry = runInInjectionContext(injector(), () => new UnsavedChangesRegistry());
    let dirty = false;
    registry.register({ hasUnsavedChanges: () => dirty });
    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent & { preventDefault: ReturnType<typeof vi.fn> };
    expect(listener(event)).toBeUndefined();
    dirty = true;
    expect(listener(event)).toBe('');
    expect(event.preventDefault).toHaveBeenCalled();
    addEventListener.mockRestore();

    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined);
    const serverRegistry = runInInjectionContext(injector(), () => new UnsavedChangesRegistry());
    serverRegistry.register({ hasUnsavedChanges: () => false });
    const guard = runInInjectionContext(injector(), () => new UnsavedChangesGuard());
    expect(guard.canDeactivate({ hasUnsavedChanges: () => true })).toBe(true);
    vi.stubGlobal('window', originalWindow);
  });
});
