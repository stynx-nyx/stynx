import { AsyncPipe, NgIf } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ErrorBannerService } from '@stynx-nyx/angular';
import { StynxSessionService, StynxHasPermissionDirective } from '@stynx-nyx/angular-auth';
import { LocaleSwitcherComponent } from '@stynx-nyx/angular-i18n';
import { StynxBannerComponent, StynxToastContainerComponent } from '@stynx-nyx/angular-ui';
import { ReferenceWebI18nService } from './core/reference-web-i18n.service';
import { ReferenceWebShellService } from './core/reference-web-shell.service';

@Component({
  selector: 'stynx-reference-web-root',
  standalone: true,
  imports: [
    AsyncPipe,
    NgIf,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    LocaleSwitcherComponent,
    StynxBannerComponent,
    StynxToastContainerComponent,
    StynxHasPermissionDirective,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <header class="shell__header">
        <div>
          <p class="shell__eyebrow">STYNX Reference Web</p>
          <h1 data-testid="app-title">{{ i18n.t('app.title') }}</h1>
        </div>
        <div class="shell__toolbar">
          <stynx-locale-switcher [locales]="i18n.locales"></stynx-locale-switcher>
          <button type="button" routerLink="/tenant">Tenant</button>
          <button type="button" *stynxHasPermission="'sample:record:write'" routerLink="/records/new">New record</button>
          <button type="button" (click)="logout()" [disabled]="!session.snapshot().active" data-testid="logout-button">Logout</button>
        </div>
      </header>

      <section class="shell__context" aria-label="Session context">
        <div>
          <strong>Tenant:</strong>
          <span>{{ shell.activeTenantLabel() }}</span>
        </div>
        <div>
          <strong>User:</strong>
          <span>{{ shell.activeUserLabel() }}</span>
        </div>
      </section>

      @if (errorBanner.current(); as error) {
        <stynx-banner
          class="shell__banner"
          tone="error"
          [title]="error.code ?? 'Request error'"
          [message]="error.message"
        ></stynx-banner>
      }

      <nav class="shell__nav" aria-label="Primary navigation">
        <a routerLink="/" routerLinkActive="is-active" [routerLinkActiveOptions]="{ exact: true }" data-testid="nav-dashboard">Dashboard</a>
        <a routerLink="/records" routerLinkActive="is-active" data-testid="nav-records">Records</a>
        <a routerLink="/work-items" routerLinkActive="is-active" data-testid="nav-work-items">Work items</a>
        <a routerLink="/trash" routerLinkActive="is-active" data-testid="nav-trash">Trash</a>
        <a routerLink="/admin/users" routerLinkActive="is-active" data-testid="nav-admin">Admin</a>
      </nav>

      <main class="shell__main">
        <router-outlet></router-outlet>
      </main>
    </div>

    <stynx-toast-container></stynx-toast-container>
  `,
  styles: [`
    .shell {
      width: min(1120px, calc(100vw - 2rem));
      margin: 0 auto;
      padding: 2rem 0 4rem;
    }

    .shell__header {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
      margin-bottom: 1.25rem;
    }

    .shell__eyebrow {
      margin: 0 0 0.35rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.72rem;
      color: var(--app-muted);
    }

    h1 {
      margin: 0;
      font-size: clamp(2rem, 3vw, 3rem);
      line-height: 0.95;
    }

    .shell__toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
      justify-content: flex-end;
    }

    .shell__toolbar button,
    .shell__nav a {
      border: 1px solid var(--app-line);
      background: var(--app-card);
      color: var(--app-ink);
      padding: 0.65rem 0.9rem;
      border-radius: 999px;
      text-decoration: none;
      backdrop-filter: blur(16px);
    }

    .shell__context,
    .shell__nav {
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }

    .shell__context {
      color: var(--app-muted);
    }

    .shell__nav a.is-active {
      background: var(--app-accent);
      color: white;
    }

    .shell__banner {
      display: block;
      margin-bottom: 1rem;
    }

    .shell__main {
      display: grid;
      gap: 1rem;
    }
  `],
})
export class AppComponent {
  protected readonly i18n = inject(ReferenceWebI18nService);
  protected readonly session = inject(StynxSessionService);
  protected readonly shell = inject(ReferenceWebShellService);
  protected readonly errorBanner = inject(ErrorBannerService);

  async logout(): Promise<void> {
    await this.shell.logout();
  }
}
