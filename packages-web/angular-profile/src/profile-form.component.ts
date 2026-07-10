import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import type { OnDestroy } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ErrorBannerService } from '@stynx-nyx/angular';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent, StynxToastService } from '@stynx-nyx/angular-ui';
import { ProfileService } from './profile.service';
import type { StynxProfile, StynxProfileValue } from './types';
import { UnsavedChangesRegistry } from './unsaved-changes.guard';
import type { StynxUnsavedChangesAware } from './unsaved-changes.guard';

export type StynxProfileFormStatus = 'idle' | 'saving' | 'saved' | 'error';

const DEFAULT_PROFILE_FORM_VALUE = {
  name: '',
  email: '',
  locale: 'en-US',
};

@Component({
  selector: 'stynx-profile-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
  ],
  template: `
    <form class="stynx-profile-form" data-testid="profile-form" [formGroup]="form" (ngSubmit)="submit()">
      @if (errorMessage()) {
        <stynx-banner
          data-testid="profile-error-banner"
          tone="error"
          [title]="'profile.form.error.title' | stynxTranslate"
          [message]="errorMessage()"
        ></stynx-banner>
      }

      <label>
        <span>{{ 'profile.form.fields.name' | stynxTranslate }}</span>
        <input data-testid="profile-name-input" formControlName="name" autocomplete="name" />
        @if (form.controls.name.touched && form.controls.name.hasError('required')) {
          <small>{{ 'profile.form.validation.nameRequired' | stynxTranslate }}</small>
        }
        @if (form.controls.name.touched && form.controls.name.hasError('maxlength')) {
          <small>{{ 'profile.form.validation.nameLength' | stynxTranslate }}</small>
        }
      </label>

      <label>
        <span>{{ 'profile.form.fields.email' | stynxTranslate }}</span>
        <input data-testid="profile-email-input" formControlName="email" autocomplete="email" type="email" />
      </label>

      <label>
        <span>{{ 'profile.form.fields.locale' | stynxTranslate }}</span>
        <input data-testid="profile-locale-input" formControlName="locale" autocomplete="language" />
      </label>

      <footer>
        @if (status() === 'saving') {
          <stynx-loading-spinner
            [size]="1"
            [label]="'profile.form.status.saving' | stynxTranslate"
          ></stynx-loading-spinner>
        }
        @if (status() === 'saved') {
          <span class="stynx-profile-status" data-testid="profile-saved-status" role="status">
            <stynx-icon name="check" aria-hidden="true"></stynx-icon>
            {{ 'profile.form.status.saved' | stynxTranslate }}
          </span>
        }
        <button data-testid="profile-save-submit" type="submit" [disabled]="form.invalid || !form.dirty || status() === 'saving'">
          <stynx-icon name="save" aria-hidden="true"></stynx-icon>
          {{ 'profile.form.actions.save' | stynxTranslate }}
        </button>
      </footer>
    </form>
  `,
  styles: [`
    .stynx-profile-form {
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

    input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.65rem 0.75rem;
      background: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-on-surface, #0f172a);
      font: inherit;
    }

    input:disabled {
      color: var(--mat-sys-on-surface-variant, #475569);
      background: var(--mat-sys-surface-container-low, #f8fafc);
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
    .stynx-profile-status {
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

    .stynx-profile-status {
      color: var(--mat-sys-primary, #2563eb);
      font-weight: 700;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxProfileFormComponent implements OnDestroy, StynxUnsavedChangesAware {
  private readonly formBuilder = inject(FormBuilder);
  private readonly profile = inject(ProfileService, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });
  private readonly errorBanner = inject(ErrorBannerService, { optional: true });
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly unsavedChanges = inject(UnsavedChangesRegistry, { optional: true });

  readonly status = signal<StynxProfileFormStatus>('idle');
  readonly errorMessage = signal('');

  /** @ignore */
  readonly form = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(160)]],
    email: ['', [Validators.required, Validators.email]],
    locale: ['en-US', [Validators.required]],
  });
  private readonly unregisterUnsavedChanges = this.unsavedChanges?.register(this) ?? (() => undefined);

  @Output() readonly save = new EventEmitter<StynxProfileValue>();

  @Input()
  set value(value: StynxProfile | StynxProfileValue | null) {
    if (!value) {
      return;
    }
    this.applyProfileValue(value);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.status.set('error');
      this.errorMessage.set(this.translate('profile.form.error.invalid'));
      return;
    }

    const value = this.form.getRawValue();
    const emitted: StynxProfileValue = value;

    this.save.emit(emitted);

    if (!this.profile) {
      this.markSaved();
      return;
    }

    this.status.set('saving');
    this.errorMessage.set('');
    this.errorBanner?.clear();
    this.profile.patch({
      displayName: value.name,
      name: value.name,
      email: value.email,
      locale: value.locale,
    }).subscribe({
      next: (profile) => {
        this.applyProfileValue(profile);
        this.markSaved();
      },
      error: () => {
        const message = this.translate('profile.form.error.saveFailed');
        this.status.set('error');
        this.errorMessage.set(message);
        this.errorBanner?.show({
          message,
          tone: 'error',
          code: 'profile.save_failed',
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

  private applyProfileValue(value: StynxProfile | StynxProfileValue): void {
    const displayName = 'displayName' in value && typeof value.displayName === 'string' ? value.displayName : '';
    this.form.reset({
      name: value.name || displayName || DEFAULT_PROFILE_FORM_VALUE.name,
      email: value.email,
      locale: value.locale,
    });
    this.status.set('idle');
    this.errorMessage.set('');
  }

  private markSaved(): void {
    this.status.set('saved');
    this.form.markAsPristine();
    this.toast?.push(this.translate('profile.form.toast.saved'), 'success');
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
