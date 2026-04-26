import { ChangeDetectionStrategy, Component } from '@angular/core';
import type { StynxSessionService } from './session.service';

@Component({
  selector: 'stynx-logout-button',
  standalone: true,
  template: `
    <button type="button" (click)="logout()">Logout</button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxLogoutButtonComponent {
  constructor(private readonly session: StynxSessionService) {}

  async logout(): Promise<void> {
    await this.session.logout();
  }
}
