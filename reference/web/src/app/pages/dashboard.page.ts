import { NgIf } from '@angular/common';
import { Component, ViewChild, inject } from '@angular/core';
import type { AfterViewInit } from '@angular/core';
import { StynxActiveSessionsComponent } from '@stynx-web/angular-sessions';
import { StynxDocumentUploadComponent } from '@stynx-web/angular-storage';
import { StynxHasPermissionDirective, StynxSessionService } from '@stynx-web/angular-auth';
import { StynxBannerComponent, StynxToastService } from '@stynx-web/angular-ui';
import { StynxPreferencesFormComponent, StynxProfileFormComponent } from '@stynx-web/angular-profile';
import type { StynxSessionsAdapter } from '@stynx-web/angular-sessions';
import { StynxIntlCurrencyPipe } from '@stynx-web/angular-i18n';
import { environment } from '../../environments/environment';
import { ReferenceWebI18nService } from '../core/reference-web-i18n.service';
import { ReferenceWebShellService } from '../core/reference-web-shell.service';

@Component({
  selector: 'stynx-reference-dashboard-page',
  standalone: true,
  imports: [
    NgIf,
    StynxBannerComponent,
    StynxDocumentUploadComponent,
    StynxActiveSessionsComponent,
    StynxProfileFormComponent,
    StynxPreferencesFormComponent,
    StynxHasPermissionDirective,
    StynxIntlCurrencyPipe,
  ],
  template: `
    <section class="stack">
      <article class="hero">
        <div>
          <p class="eyebrow">Prompt 31</p>
          <h2 data-testid="dashboard-title">{{ i18n.t('dashboard.title') }}</h2>
          <p class="tenant-label">{{ shell.activeTenantLabel() }}</p>
          <p data-testid="i18n-number-sample">{{ 1234.56 | stynxIntlCurrency:'USD' }}</p>
          <p>Dashboard, storage, sessions, profile, locale switching, and auth wiring are all mounted here.</p>
        </div>
        <stynx-banner tone="info" [message]="'Signed in as ' + shell.activeUserLabel()"></stynx-banner>
      </article>

      <section class="grid">
        <article class="card" data-testid="dashboard-document-upload-card" *stynxHasPermission="'sample:document:write'">
          <h3>Document upload</h3>
          <stynx-document-upload
            data-testid="dashboard-document-upload"
            collection="records"
            [allowedMimes]="['application/pdf', 'image/png', 'image/jpeg']"
            [maxBytes]="25000000"
            (completed)="uploadedDocumentId = $event.id"
          ></stynx-document-upload>
          @if (uploadedDocumentId) {
            <p data-testid="dashboard-upload-result">Last upload id: {{ uploadedDocumentId }}</p>
          }
        </article>

        <article class="card" data-testid="dashboard-active-sessions">
          <h3>Active sessions</h3>
          <stynx-active-sessions [adapter]="sessionsAdapter"></stynx-active-sessions>
        </article>
      </section>

      <section class="grid">
        <article class="card">
          <h3>Profile</h3>
          <stynx-profile-form [value]="profileValue" (save)="saveProfile($event)"></stynx-profile-form>
        </article>

        <article class="card">
          <h3>Preferences</h3>
          <stynx-preferences-form [value]="preferencesValue" (save)="savePreferences($event)"></stynx-preferences-form>
        </article>
      </section>
    </section>
  `,
  styles: [`
    .stack,
    .grid {
      display: grid;
      gap: 1rem;
    }

    .grid {
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    }

    .hero,
    .card {
      padding: 1.4rem;
      border-radius: 24px;
      background: var(--app-card);
      border: 1px solid var(--app-line);
    }

    .hero {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: flex-start;
    }

    .eyebrow {
      margin: 0 0 0.35rem;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.72rem;
      color: var(--app-muted);
    }
  `],
})
export class DashboardPageComponent implements AfterViewInit {
  private readonly session = inject(StynxSessionService);
  private readonly toast = inject(StynxToastService);
  protected readonly i18n = inject(ReferenceWebI18nService);
  protected readonly shell = inject(ReferenceWebShellService);
  protected uploadedDocumentId = '';
  protected profileValue = {
    name: 'Reference Admin',
    email: 'admin@sample-demo.test',
    locale: 'en-US',
  };
  protected preferencesValue = {
    locale: 'en-US',
    notifications: true,
  };
  private devSecondarySession = environment.production
    ? null
    : {
        sid: 'sid-reference-dev-secondary',
        tenantId: 'reference-dev-secondary',
        createdAt: '2026-05-19T00:00:00.000Z',
        expiresAt: '2026-05-19T01:00:00.000Z',
      };
  protected readonly sessionsAdapter: StynxSessionsAdapter = {
    list: async () => {
      const snapshot = this.session.snapshot();
      return snapshot.sid
        ? [{
            sid: snapshot.sid,
            tenantId: snapshot.tenantId ?? 'n/a',
            createdAt: new Date().toISOString(),
            expiresAt: typeof snapshot.claims?.exp === 'number'
              ? new Date(snapshot.claims.exp * 1000).toISOString()
              : 'unknown',
          }, ...(this.devSecondarySession ? [this.devSecondarySession] : [])]
        : [];
    },
    revoke: async (sid: string) => {
      if (sid === this.session.snapshot().sid) {
        await this.session.logout();
        return;
      }
      if (sid === this.devSecondarySession?.sid) {
        this.devSecondarySession = null;
      }
    },
    revokeOthers: async () => {
      this.devSecondarySession = null;
    },
  };

  @ViewChild(StynxActiveSessionsComponent)
  private readonly activeSessionsComponent?: StynxActiveSessionsComponent;

  async ngAfterViewInit(): Promise<void> {
    await this.activeSessionsComponent?.load();
  }

  saveProfile(value: { name: string; email: string; locale: string }): void {
    this.profileValue = value;
    this.toast.push('Profile saved locally', 'success');
  }

  savePreferences(value: { locale: string; notifications: boolean }): void {
    this.preferencesValue = value;
    this.toast.push('Preferences saved locally', 'success');
  }
}
