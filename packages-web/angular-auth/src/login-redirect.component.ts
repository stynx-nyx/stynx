import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import type { OnInit } from '@angular/core';
import { StynxSessionService } from './session.service';

@Component({
  selector: 'stynx-login-redirect',
  standalone: true,
  template: `
    <section class="stynx-login-redirect">
      <p>Completing sign in...</p>
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
