import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StynxSessionService } from './session.service';

@Component({
  selector: 'stynx-logout-button',
  standalone: true,
  template: `
    <button type="button" (click)="logout()">Logout</button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxLogoutButtonComponent {
  private readonly session = inject(StynxSessionService);

  async logout(): Promise<void> {
    await this.session.logout();
  }
}
