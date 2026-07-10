import { NgFor } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject } from '@angular/core';
import { ReactiveFormsModule, Validators, FormBuilder } from '@angular/forms';
import { StynxBannerComponent } from '@stynx-nyx/angular-ui';
import { ReferenceWebShellService } from '../core/reference-web-shell.service';

@Component({
  selector: 'stynx-reference-login-page',
  standalone: true,
  imports: [NgFor, ReactiveFormsModule, StynxBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel" aria-labelledby="login-title">
      <div>
        <h2 id="login-title" data-testid="login-title">Sign in to reference-web</h2>
        <p>Prompt 31 uses a deterministic app-local auth seam over the live STYNX session stack.</p>
      </div>

      <form class="form" [formGroup]="form" (ngSubmit)="submit()" data-testid="login-form">
        <label for="login-email-input">
          <span>Email</span>
          <input id="login-email-input" type="email" formControlName="email" autocomplete="email" data-testid="login-email" />
        </label>

        <label for="login-tenant-select">
          <span>Tenant</span>
          <select id="login-tenant-select" formControlName="tenantId" data-testid="login-tenant">
            @for (tenant of shell.tenants(); track tenant.id) {
              <option [value]="tenant.id">{{ tenant.name }}</option>
            }
          </select>
        </label>

        @if (errorMessage) {
          <stynx-banner tone="error" [message]="errorMessage" data-testid="login-error-banner"></stynx-banner>
        }

        <button type="submit" [disabled]="form.invalid || pending" data-testid="login-submit">
          {{ pending ? 'Signing in...' : 'Sign in' }}
        </button>
      </form>
    </section>
  `,
  styles: [`
    .panel {
      display: grid;
      gap: 1rem;
      padding: 1.5rem;
      border-radius: 24px;
      background: var(--app-card);
      border: 1px solid var(--app-line);
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.08);
    }

    .form {
      display: grid;
      gap: 1rem;
      max-width: 32rem;
    }

    label {
      display: grid;
      gap: 0.45rem;
    }

    input,
    select,
    button {
      border-radius: 14px;
      border: 1px solid var(--app-line);
      padding: 0.85rem 1rem;
      background: white;
    }

    button {
      justify-self: start;
      background: var(--app-accent);
      color: white;
    }
  `],
})
export class LoginPageComponent {
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly shell = inject(ReferenceWebShellService);
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['admin@sample-demo.test', [Validators.required, Validators.email]],
    tenantId: ['01978f4a-32bf-7c27-a131-fd73a9e001a1', [Validators.required]],
  });
  protected pending = false;
  protected errorMessage = '';

  async submit(): Promise<void> {
    if (this.form.invalid) {
      return;
    }
    this.pending = true;
    this.errorMessage = '';
    try {
      const value = this.form.getRawValue();
      await this.shell.login(value.email, value.tenantId);
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'Unable to sign in.';
    } finally {
      this.pending = false;
      this.changeDetector.detectChanges();
    }
  }
}
