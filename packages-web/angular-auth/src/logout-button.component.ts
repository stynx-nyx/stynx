import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { StynxSessionService } from './session.service';

@Component({
  selector: 'stynx-logout-button',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    <button type="button" (click)="logout()">{{ 'auth.logoutButton.label' | stynxTranslate }}</button>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxLogoutButtonComponent {
  private readonly session = inject(StynxSessionService);

  async logout(): Promise<void> {
    await this.session.logout();
  }
}
