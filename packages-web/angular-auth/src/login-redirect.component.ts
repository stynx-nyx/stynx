import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxSessionService } from './session.service';

@Component({
  selector: 'stynx-login-redirect',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    <section class="stynx-login-redirect">
      <p>{{ 'auth.loginRedirect.completing' | stynxTranslate }}</p>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxLoginRedirectComponent implements OnInit {
  private readonly session = inject(StynxSessionService);

  async ngOnInit(): Promise<void> {
    await this.session.completeLogin(typeof window === 'undefined' ? undefined : window.location.href);
  }
}
