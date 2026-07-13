import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ErrorBannerService } from '@stynx-nyx/angular';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import {
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
  StynxToastService,
} from '@stynx-nyx/angular-ui';
import { ProfileService } from './profile.service';
import type { PreferenceValues, StynxPreferences, StynxPreferencesValue } from './types';
import { UnsavedChangesRegistry } from './unsaved-changes.guard';
import type { StynxUnsavedChangesAware } from './unsaved-changes.guard';

export type StynxPreferencesFormStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_PREFERENCES_FORM_VALUE = {
  locale: 'en-US',
  notifications: false,
};

@Component({
  selector: 'stynx-preferences-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
  ],
  template: `
    <form
      class="stynx-preferences-form"
      data-testid="preferences-form"
      [formGroup]="form"
      (ngSubmit)="submit()"
    >
      @if (errorMessage()) {
        <stynx-banner
          data-testid="preferences-error-banner"
          tone="error"
          [title]="'profile.preferences.error.title' | stynxTranslate"
          [message]="errorMessage()"
        ></stynx-banner>
      }

      <label>
        <span>{{ 'profile.preferences.fields.locale' | stynxTranslate }}</span>
        <input
          data-testid="preferences-locale-input"
          formControlName="locale"
          autocomplete="language"
        />
        @if (form.controls.locale.touched && form.controls.locale.hasError('required')) {
          <small>{{ 'profile.preferences.validation.localeRequired' | stynxTranslate }}</small>
        }
      </label>

      <label class="stynx-preferences-check">
        <input
          data-testid="preferences-notifications-checkbox"
          type="checkbox"
          formControlName="notifications"
        />
        <span>{{ 'profile.preferences.fields.notifications' | stynxTranslate }}</span>
      </label>

      <ng-content></ng-content>

      <footer>
        @if (status() === 'saving') {
          <stynx-loading-spinner
            [size]="1"
            [label]="'profile.preferences.status.saving' | stynxTranslate"
          ></stynx-loading-spinner>
        }
        @if (status() === 'saved') {
          <span
            class="stynx-preferences-status"
            data-testid="preferences-saved-status"
            role="status"
          >
            <stynx-icon name="check" aria-hidden="true"></stynx-icon>
            {{ 'profile.preferences.status.saved' | stynxTranslate }}
          </span>
        }
        <button
          data-testid="preferences-save-submit"
          type="submit"
          [disabled]="form.invalid || !form.dirty || status() === 'saving'"
        >
          <stynx-icon name="save" aria-hidden="true"></stynx-icon>
          {{ 'profile.preferences.actions.save' | stynxTranslate }}
        </button>
      </footer>
    </form>
  `,
  styles: [
    `
      .stynx-preferences-form {
        display: grid;
        gap: 1rem;
        max-width: 44rem;
      }

      label {
        display: grid;
        gap: 0.35rem;
        color: var(--mat-sys-on-surface, #0f172a);
        font-weight: 600;
      }

      input[type='text'],
      input:not([type]) {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
        border-radius: 8px;
        padding: 0.65rem 0.75rem;
        background: var(--mat-sys-surface, #ffffff);
        color: var(--mat-sys-on-surface, #0f172a);
        font: inherit;
      }

      .stynx-preferences-check {
        display: flex;
        align-items: center;
        gap: 0.55rem;
      }

      input[type='checkbox'] {
        width: 1.1rem;
        height: 1.1rem;
        accent-color: var(--mat-sys-primary, #2563eb);
      }

      small {
        color: var(--mat-sys-error, #dc2626);
        font-weight: 500;
      }

      footer {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
      }

      button,
      .stynx-preferences-status {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
      }

      button {
        border: 1px solid var(--mat-sys-primary, #2563eb);
        border-radius: 8px;
        padding: 0.65rem 0.9rem;
        background: var(--mat-sys-primary, #2563eb);
        color: var(--mat-sys-on-primary, #ffffff);
        font: inherit;
        font-weight: 700;
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }

      stynx-icon {
        --stynx-icon-size: 1rem;
      }

      .stynx-preferences-status {
        color: var(--mat-sys-primary, #2563eb);
        font-weight: 700;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxPreferencesFormComponent implements OnDestroy, StynxUnsavedChangesAware {
  private readonly formBuilder = inject(FormBuilder);
  private readonly profile = inject(ProfileService, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });
  private readonly errorBanner = inject(ErrorBannerService, { optional: true });
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly unsavedChanges = inject(UnsavedChangesRegistry, { optional: true });

  readonly status = signal<StynxPreferencesFormStatus>('idle');
  readonly errorMessage = signal('');
  private readonly currentLocale = signal(DEFAULT_PREFERENCES_FORM_VALUE.locale);

  /** @ignore */
  readonly form = this.formBuilder.nonNullable.group({
    locale: [DEFAULT_PREFERENCES_FORM_VALUE.locale, [Validators.required]],
    notifications: [DEFAULT_PREFERENCES_FORM_VALUE.notifications],
  });
  private readonly unregisterUnsavedChanges =
    this.unsavedChanges?.register(this) ?? (() => undefined);

  @Output() readonly save = new EventEmitter<StynxPreferencesValue>();

  @Input()
  set value(value: StynxPreferences | StynxPreferencesValue | null) {
    if (!value) {
      return;
    }
    this.applyPreferencesValue(value);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.status.set('error');
      this.errorMessage.set(this.translate('profile.preferences.error.invalid'));
      return;
    }

    const value = this.form.getRawValue();
    this.save.emit(value);

    if (!this.profile) {
      this.applyLocaleChange(value.locale);
      this.markSaved(value);
      return;
    }

    this.status.set('saving');
    this.errorMessage.set('');
    this.errorBanner?.clear();
    const current =
      typeof this.profile.preferences === 'function'
        ? this.profile.preferences()?.values
        : undefined;
    const wireValue: PreferenceValues = current
      ? {
          ...current,
          locale: { ...current.locale, locale: value.locale },
          notificationDelivery: {
            email: value.notifications,
            push: value.notifications,
            inApp: value.notifications,
          },
        }
      : {
          locale: { locale: value.locale, timezone: 'UTC' },
          theme: { colorScheme: 'system', contrast: 'standard', density: 'comfortable' },
          accessibility: { reduceMotion: false, largeText: false, screenReaderOptimized: false },
          notificationDelivery: {
            email: value.notifications,
            push: value.notifications,
            inApp: value.notifications,
          },
        };
    this.profile.setPreferences(wireValue).subscribe({
      next: (preferences) => {
        const legacy = preferences as unknown as StynxPreferencesValue;
        this.applyLocaleChange(
          'values' in preferences ? preferences.values.locale.locale : legacy.locale,
        );
        this.markSaved(preferences);
      },
      error: () => {
        const message = this.translate('profile.preferences.error.saveFailed');
        this.status.set('error');
        this.errorMessage.set(message);
        this.errorBanner?.show({
          message,
          tone: 'error',
          code: 'profile.preferences_save_failed',
        });
      },
    });
  }

  ngOnDestroy(): void {
    this.unregisterUnsavedChanges();
  }

  hasUnsavedChanges(): boolean {
    return this.form.dirty;
  }

  confirmDiscardChanges(): boolean {
    return typeof globalThis.window === 'object'
      ? globalThis.window.confirm(this.translate('profile.unsaved.confirm'))
      : true;
  }

  private applyPreferencesValue(value: StynxPreferences | StynxPreferencesValue): void {
    const wire = 'values' in value ? value.values : null;
    const nextValue = {
      locale:
        wire?.locale.locale ??
        (('locale' in value ? value.locale : '') || DEFAULT_PREFERENCES_FORM_VALUE.locale),
      notifications:
        wire?.notificationDelivery.inApp ??
        ('notifications' in value ? value.notifications : null) ??
        DEFAULT_PREFERENCES_FORM_VALUE.notifications,
    };
    this.form.reset(nextValue);
    this.currentLocale.set(nextValue.locale);
    this.status.set('idle');
    this.errorMessage.set('');
  }

  private markSaved(value: StynxPreferences | StynxPreferencesValue): void {
    const wire = 'values' in value ? value.values : null;
    this.form.reset({
      locale:
        wire?.locale.locale ??
        (('locale' in value ? value.locale : '') || DEFAULT_PREFERENCES_FORM_VALUE.locale),
      notifications:
        wire?.notificationDelivery.inApp ??
        ('notifications' in value ? value.notifications : null) ??
        DEFAULT_PREFERENCES_FORM_VALUE.notifications,
    });
    this.form.markAsPristine();
    this.status.set('saved');
    this.errorMessage.set('');
    this.toast?.push(this.translate('profile.preferences.toast.saved'), 'success');
  }

  private applyLocaleChange(locale: string): void {
    if (!locale || locale === this.currentLocale()) {
      return;
    }
    this.currentLocale.set(locale);
    void this.i18n?.use(locale).catch(() => undefined);
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
