import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import type { Provider } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ErrorBannerService } from '@stynx-web/angular';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { STYNX_OIDC_ADAPTER } from '@stynx-web/angular-auth';
import { StynxToastService } from '@stynx-web/angular-ui';
import { of, throwError } from 'rxjs';
import {
  StynxChangePasswordHandoffComponent,
  StynxMfaEnrolmentHandoffComponent,
} from '../src/hosted-auth-action-handoff.component';
import { StynxPreferencesFormComponent } from '../src/preferences-form.component';
import { StynxProfileFormComponent } from '../src/profile-form.component';
import { ProfileService } from '../src/profile.service';
import type { StynxHostedAuthAction } from '@stynx-web/angular-auth';

function createWithFormBuilder<T>(factory: () => T, providers: Provider[] = []): T {
  const injector = Injector.create({
    providers: [{ provide: FormBuilder, useValue: new FormBuilder() }, ...providers],
  });
  return runInInjectionContext(injector, factory);
}

function createHandoffComponent<T>(
  componentFactory: () => T,
  adapter: {
    getHostedActionLink?: (action: StynxHostedAuthAction, context?: unknown) => unknown;
    openHostedAction?: (action: StynxHostedAuthAction, context?: unknown) => void;
  },
  errors: unknown[] = [],
): T {
  const injector = Injector.create({
    providers: [
      { provide: STYNX_OIDC_ADAPTER, useValue: adapter },
      {
        provide: StynxI18nService,
        useValue: {
          translate: (key: string) => key,
        },
      },
      {
        provide: ErrorBannerService,
        useValue: {
          show: (error: unknown) => errors.push(error),
        },
      },
    ],
  });
  return runInInjectionContext(injector, componentFactory);
}

describe('@stynx-web/angular-profile', () => {
  it('validates the profile form and emits only when dirty and valid', () => {
    const component = createWithFormBuilder(() => new StynxProfileFormComponent());
    const seen: unknown[] = [];
    component.save.subscribe((value) => seen.push(value));
    component.value = null;
    expect(component.form.getRawValue()).toEqual({
      name: '',
      email: '',
      locale: 'en-US',
    });

    component.value = {
      name: 'Ana',
      email: 'ana@example.test',
      locale: 'en-US',
    };
    expect(component.form.dirty).toBe(false);

    component.form.patchValue({
      email: 'invalid',
    });
    component.submit();
    expect(seen).toHaveLength(0);
    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('profile.form.error.invalid');

    component.form.patchValue({
      email: 'ana@example.test',
      locale: 'pt-BR',
    });
    component.form.markAsDirty();
    expect(component.form.dirty).toBe(true);
    component.submit();
    expect(seen).toEqual([
      {
        name: 'Ana',
        email: 'ana@example.test',
        locale: 'pt-BR',
      },
    ]);
  });

  it('saves profile changes through ProfileService and reports failures', () => {
    const toast = { push: vi.fn() };
    const errorBanner = { clear: vi.fn(), show: vi.fn() };
    const profile = {
      patch: vi.fn((value: unknown) => of({
        id: 'profile-1',
        displayName: 'Ana Saved',
        name: 'Ana Saved',
        email: 'ana@example.test',
        locale: 'pt-BR',
        received: value,
      })),
    };
    const component = createWithFormBuilder(
      () => new StynxProfileFormComponent(),
      [
        { provide: ProfileService, useValue: profile },
        { provide: StynxI18nService, useValue: { translate: (key: string) => key } },
        { provide: ErrorBannerService, useValue: errorBanner },
        { provide: StynxToastService, useValue: toast },
      ],
    );

    component.value = { name: 'Ana', email: 'ana@example.test', locale: 'en-US' };
    component.form.patchValue({ locale: 'pt-BR' });
    component.form.markAsDirty();
    component.submit();

    expect(profile.patch).toHaveBeenCalledWith({
      displayName: 'Ana',
      name: 'Ana',
      email: 'ana@example.test',
      locale: 'pt-BR',
    });
    expect(errorBanner.clear).toHaveBeenCalled();
    expect(component.status()).toBe('saved');
    expect(component.form.dirty).toBe(false);

    profile.patch.mockReturnValueOnce(throwError(() => new Error('profile save failed')));
    component.form.patchValue({ name: 'Ana Failed' });
    component.form.markAsDirty();
    component.submit();

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('profile.form.error.saveFailed');
    expect(errorBanner.show).toHaveBeenCalledWith({
      message: 'profile.form.error.saveFailed',
      tone: 'error',
      code: 'profile.save_failed',
    });
  });

  it('tracks dirty state in the preferences form', () => {
    const component = createWithFormBuilder(() => new StynxPreferencesFormComponent());
    const seen: unknown[] = [];
    component.save.subscribe((value) => seen.push(value));
    component.value = null;
    expect(component.form.getRawValue()).toEqual({
      locale: 'en-US',
      notifications: false,
    });
    component.value = {
      locale: 'en-US',
      notifications: false,
    };

    expect(component.form.dirty).toBe(false);
    component.form.patchValue({
      notifications: true,
    });
    component.form.markAsDirty();
    expect(component.form.dirty).toBe(true);
    component.submit();
    expect(seen).toEqual([{ locale: 'en-US', notifications: true }]);
    expect(component.form.dirty).toBe(false);
  });

  it('saves preferences through ProfileService, changes locale, and reports failures', () => {
    const toast = { push: vi.fn() };
    const errorBanner = { clear: vi.fn(), show: vi.fn() };
    const i18n = {
      translate: (key: string) => key,
      use: vi.fn(() => Promise.resolve()),
    };
    const profile = {
      setPreferences: vi.fn(() => of({ locale: 'pt-BR', notifications: true })),
    };
    const component = createWithFormBuilder(
      () => new StynxPreferencesFormComponent(),
      [
        { provide: ProfileService, useValue: profile },
        { provide: StynxI18nService, useValue: i18n },
        { provide: ErrorBannerService, useValue: errorBanner },
        { provide: StynxToastService, useValue: toast },
      ],
    );

    component.value = { locale: 'en-US', notifications: false };
    component.form.patchValue({ locale: '', notifications: true });
    component.form.markAsDirty();
    component.submit();
    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('profile.preferences.error.invalid');

    component.form.patchValue({ locale: 'pt-BR' });
    component.form.markAsDirty();
    component.submit();

    expect(profile.setPreferences).toHaveBeenCalledWith({ locale: 'pt-BR', notifications: true });
    expect(errorBanner.clear).toHaveBeenCalled();
    expect(i18n.use).toHaveBeenCalledWith('pt-BR');
    expect(component.status()).toBe('saved');
    expect(component.form.getRawValue()).toEqual({ locale: 'pt-BR', notifications: true });

    profile.setPreferences.mockReturnValueOnce(throwError(() => new Error('preferences save failed')));
    component.form.patchValue({ notifications: false });
    component.form.markAsDirty();
    component.submit();

    expect(component.status()).toBe('error');
    expect(component.errorMessage()).toBe('profile.preferences.error.saveFailed');
    expect(errorBanner.show).toHaveBeenCalledWith({
      message: 'profile.preferences.error.saveFailed',
      tone: 'error',
      code: 'profile.preferences_save_failed',
    });
  });

  it('opens the configured change-password hosted action', () => {
    const calls: unknown[] = [];
    const component = createHandoffComponent(
      () => new StynxChangePasswordHandoffComponent(),
      {
        getHostedActionLink: (action, context) => {
          calls.push(['link', action, context]);
          return {
            action,
            url: 'https://idp.example.test/change-password',
            method: 'browser-redirect',
          };
        },
        openHostedAction: (action, context) => {
          calls.push(['open', action, context]);
        },
      },
    );

    component.returnUrl = 'https://app.example.test/profile/security';
    component.state = 'security-tab';
    component.tenantId = 'tenant-a';
    component.locale = 'pt-BR';
    expect(component.handoff.status()).toBe('ready');
    component.handoff.open();

    expect(calls.at(-1)).toEqual([
      'open',
      'change-password',
      {
        returnUrl: 'https://app.example.test/profile/security',
        state: 'security-tab',
        tenantId: 'tenant-a',
        locale: 'pt-BR',
      },
    ]);
  });

  it('marks MFA enrolment unavailable when no hosted action URL is configured', () => {
    const component = createHandoffComponent(
      () => new StynxMfaEnrolmentHandoffComponent(),
      {
        getHostedActionLink: () => null,
      },
    );

    expect(component.handoff.status()).toBe('unavailable');
    expect(component.handoff.message()).toBe('profile.security.mfaEnrolment.unavailable');
  });

  it('reports hosted action configuration errors to the standard error banner', () => {
    const errors: unknown[] = [];
    const component = createHandoffComponent(
      () => new StynxChangePasswordHandoffComponent(),
      {
        getHostedActionLink: () => {
          throw new Error('invalid hosted action URL');
        },
      },
      errors,
    );

    expect(component.handoff.status()).toBe('error');
    expect(component.handoff.message()).toBe('profile.security.changePassword.error');
    expect(errors).toEqual([
      {
        message: 'profile.security.changePassword.error',
        tone: 'error',
        code: 'AUTH:CONFIG:hosted-action-url',
        context: { action: 'change-password' },
      },
    ]);
  });
});
