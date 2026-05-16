import { Component } from '@angular/core';
import { StynxBannerComponent } from '@stynx-web/angular-ui';

@Component({
  selector: 'stynx-reference-unauthorized-page',
  standalone: true,
  imports: [StynxBannerComponent],
  template: `
    <section class="panel">
      <h2>Unauthorized</h2>
      <stynx-banner tone="warning" message="The current session is missing the required permission for this route."></stynx-banner>
    </section>
  `,
  styles: [`
    .panel {
      padding: 1.5rem;
      border-radius: 24px;
      background: var(--app-card);
      border: 1px solid var(--app-line);
    }
  `],
})
export class UnauthorizedPageComponent {}
