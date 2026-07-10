import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import {
  StynxChangePasswordHandoffComponent,
  StynxMfaEnrolmentHandoffComponent,
} from './hosted-auth-action-handoff.component';

@Component({
  selector: 'stynx-profile-security',
  standalone: true,
  imports: [
    StynxChangePasswordHandoffComponent,
    StynxMfaEnrolmentHandoffComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-profile-security" data-testid="profile-security-route">
      <header>
        <h2>{{ 'profile.security.title' | stynxTranslate }}</h2>
        <p>{{ 'profile.security.description' | stynxTranslate }}</p>
      </header>

      <div class="stynx-profile-security__actions">
        <stynx-change-password-handoff></stynx-change-password-handoff>
        <stynx-mfa-enrolment-handoff></stynx-mfa-enrolment-handoff>
      </div>
    </section>
  `,
  styles: [`
    .stynx-profile-security {
      display: grid;
      gap: 1rem;
      max-width: 44rem;
    }

    header {
      display: grid;
      gap: 0.35rem;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      color: var(--mat-sys-on-surface, #0f172a);
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1.3;
    }

    p {
      color: var(--mat-sys-on-surface-variant, #475569);
      line-height: 1.5;
    }

    .stynx-profile-security__actions {
      display: grid;
      gap: 0.75rem;
      justify-items: start;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxProfileSecurityComponent {}
