import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxBannerComponent, StynxIconComponent, StynxLoadingSpinnerComponent } from '@stynx-web/angular-ui';
import type { StynxCreateUserRequest } from './types';

export interface StynxUserCreateFormValue {
  email: string;
  firstName: string;
  lastName: string;
  locale: string;
  sendInvite: boolean;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

@Component({
  selector: 'stynx-user-create-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
  ],
  template: `
    @if (open) {
      <section class="stynx-iam-dialog-backdrop">
        <form class="stynx-iam-dialog" [formGroup]="form" (ngSubmit)="submit()">
          <header>
            <h2>{{ 'iam.users.create.title' | stynxTranslate }}</h2>
            <button type="button" class="icon-button" [attr.aria-label]="'iam.common.close' | stynxTranslate" (click)="dismissed.emit()">
              <stynx-icon name="close" aria-hidden="true"></stynx-icon>
            </button>
          </header>

          @if (error) {
            <stynx-banner
              tone="error"
              [title]="'iam.users.create.errorTitle' | stynxTranslate"
              [message]="error"
            ></stynx-banner>
          }

          <label>
            <span>{{ 'iam.users.fields.email' | stynxTranslate }}</span>
            <input formControlName="email" type="email" autocomplete="email" />
            @if (form.controls.email.touched && form.controls.email.hasError('required')) {
              <small>{{ 'iam.users.validation.emailRequired' | stynxTranslate }}</small>
            }
            @if (form.controls.email.touched && form.controls.email.hasError('email')) {
              <small>{{ 'iam.users.validation.emailInvalid' | stynxTranslate }}</small>
            }
          </label>

          <div class="field-grid">
            <label>
              <span>{{ 'iam.users.fields.firstName' | stynxTranslate }}</span>
              <input formControlName="firstName" autocomplete="given-name" />
            </label>
            <label>
              <span>{{ 'iam.users.fields.lastName' | stynxTranslate }}</span>
              <input formControlName="lastName" autocomplete="family-name" />
            </label>
          </div>

          <label>
            <span>{{ 'iam.users.fields.locale' | stynxTranslate }}</span>
            <input formControlName="locale" autocomplete="language" />
          </label>

          <label class="check-row">
            <input formControlName="sendInvite" type="checkbox" />
            <span>{{ 'iam.users.create.sendInvite' | stynxTranslate }}</span>
          </label>

          <footer>
            @if (saving) {
              <stynx-loading-spinner
                [size]="1"
                [label]="'iam.users.create.saving' | stynxTranslate"
              ></stynx-loading-spinner>
            }
            <span class="spacer"></span>
            <button type="button" class="secondary" (click)="dismissed.emit()">
              {{ 'iam.common.cancel' | stynxTranslate }}
            </button>
            <button type="submit" [disabled]="form.invalid || saving">
              <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
              {{ 'iam.users.create.submit' | stynxTranslate }}
            </button>
          </footer>
        </form>
      </section>
    }
  `,
  styles: [`
    .stynx-iam-dialog-backdrop {
      position: fixed;
      inset: 0;
      z-index: 900;
      display: grid;
      place-items: center;
      padding: 1rem;
      background: rgba(15, 23, 42, 0.36);
    }

    .stynx-iam-dialog {
      width: min(36rem, 100%);
      display: grid;
      gap: 1rem;
      border-radius: 8px;
      background: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-on-surface, #0f172a);
      padding: 1.25rem;
      box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
    }

    header,
    footer,
    .check-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    header {
      justify-content: space-between;
    }

    h2 {
      margin: 0;
      font-size: 1.15rem;
    }

    label {
      display: grid;
      gap: 0.35rem;
      font-weight: 650;
    }

    input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.65rem 0.75rem;
      color: inherit;
      background: var(--mat-sys-surface, #ffffff);
      font: inherit;
    }

    input[type='checkbox'] {
      width: auto;
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    small {
      color: var(--mat-sys-error, #dc2626);
      font-weight: 500;
    }

    footer {
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .spacer {
      flex: 1 1 auto;
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      border: 1px solid var(--mat-sys-primary, #2563eb);
      border-radius: 8px;
      padding: 0.6rem 0.85rem;
      background: var(--mat-sys-primary, #2563eb);
      color: var(--mat-sys-on-primary, #ffffff);
      font: inherit;
      font-weight: 700;
    }

    button.secondary,
    button.icon-button {
      border-color: var(--mat-sys-outline-variant, #cbd5e1);
      background: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-on-surface, #0f172a);
    }

    button.icon-button {
      width: 2.25rem;
      height: 2.25rem;
      padding: 0;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
    }

    @media (max-width: 36rem) {
      .field-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxUserCreateDialogComponent {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  @Input() open = false;
  @Input() saving = false;
  @Input() error = '';
  @Output() readonly create = new EventEmitter<StynxCreateUserRequest>();
  @Output() readonly dismissed = new EventEmitter<void>();

  readonly form = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    firstName: [''],
    lastName: [''],
    locale: ['en-US', [Validators.required]],
    sendInvite: [true],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const value: StynxUserCreateFormValue = this.form.getRawValue();
    const body: StynxCreateUserRequest = {
      email: value.email.trim(),
      sendInvite: value.sendInvite,
    };
    const firstName = optionalText(value.firstName);
    const lastName = optionalText(value.lastName);
    const locale = optionalText(value.locale);
    if (firstName) {
      body.firstName = firstName;
    }
    if (lastName) {
      body.lastName = lastName;
    }
    if (locale) {
      body.locale = locale;
    }
    this.create.emit(body);
  }

  reset(): void {
    this.form.reset({
      email: '',
      firstName: '',
      lastName: '',
      locale: 'en-US',
      sendInvite: true,
    });
  }
}
