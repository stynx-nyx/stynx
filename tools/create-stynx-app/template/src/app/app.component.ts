import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TenantContextService } from '@stynx-web/angular';
import { StynxSessionService } from '@stynx-web/angular-auth';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="shell">
      <header>
        <span class="eyebrow">STYNX starter</span>
        <h1>__APP_NAME__</h1>
        <p>Angular 20 standalone app with STYNX defaults, OIDC auth, tenancy, and Flow wiring.</p>
      </header>

      <nav aria-label="Primary">
        <a routerLink="/">Home</a>
        <button type="button" (click)="login()">Sign in</button>
      </nav>

      <section class="status" aria-label="Session status">
        <div>
          <span>Tenant</span>
          <strong>{{ tenantId() ?? 'unresolved' }}</strong>
        </div>
        <div>
          <span>Session</span>
          <strong>{{ session.active() ? 'active' : 'inactive' }}</strong>
        </div>
      </section>

      <router-outlet />
    </main>
  `,
})
export class AppComponent {
  protected readonly session = inject(StynxSessionService);
  private readonly tenant = inject(TenantContextService);
  protected readonly tenantId = this.tenant.tenantId;

  login(): void {
    this.session.login();
  }
}
