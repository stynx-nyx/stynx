import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StynxBannerComponent } from '@stynx-nyx/angular-ui';

@Component({
  selector: 'stynx-reference-unauthorized-page',
  standalone: true,
  imports: [StynxBannerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel">
      <h2 data-testid="unauthorized-title">Unauthorized</h2>
      <stynx-banner
        tone="warning"
        message="The current session is missing the required permission for this route."
        data-testid="unauthorized-banner"
      ></stynx-banner>
    </section>
  `,
  styles: [
    `
      .panel {
        padding: 1.5rem;
        border-radius: 24px;
        background: var(--app-card);
        border: 1px solid var(--app-line);
      }
    `,
  ],
})
export class UnauthorizedPageComponent {}
