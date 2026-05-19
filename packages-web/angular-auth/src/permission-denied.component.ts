import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { StynxSessionService } from './session.service';

@Component({
  selector: 'stynx-permission-denied',
  standalone: true,
  imports: [StynxTranslatePipe],
  template: `
    <section class="stynx-permission-denied" role="alert" aria-labelledby="stynx-permission-denied-title">
      <h1 id="stynx-permission-denied-title">
        {{ 'auth.permissionDenied.title' | stynxTranslate }}
      </h1>
      <p>{{ 'auth.permissionDenied.message' | stynxTranslate }}</p>
      <button type="button" (click)="loginRedirect()">
        {{ 'auth.permissionDenied.actions.loginAgain' | stynxTranslate }}
      </button>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxPermissionDeniedComponent {
  private readonly session = inject(StynxSessionService);

  loginRedirect(): void {
    this.session.loginRedirect();
  }
}
