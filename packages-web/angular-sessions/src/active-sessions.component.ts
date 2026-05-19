import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, inject } from '@angular/core';
import { StynxSessionService } from '@stynx-web/angular-auth';
import { StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { EmptyStateComponent, StynxToastService } from '@stynx-web/angular-ui';
import type { StynxActiveSession, StynxSessionsAdapter } from './types';

@Component({
  selector: 'stynx-active-sessions',
  standalone: true,
  imports: [EmptyStateComponent, StynxTranslatePipe],
  template: `
    @if (sessions.length === 0) {
      <stynx-empty-state
        [title]="'sessions.active.empty.title' | stynxTranslate"
        [description]="'sessions.active.empty.description' | stynxTranslate"
        data-testid="active-sessions-empty"
      ></stynx-empty-state>
    } @else {
      <section class="stynx-session-list" data-testid="active-sessions-list">
        @for (session of sessions; track session.sid) {
          <article class="stynx-session-row" [attr.data-testid]="'active-session-row-' + session.sid">
            <div>
              <strong [attr.data-testid]="'active-session-tenant-' + session.sid">{{ session.tenantId }}</strong>
              <span>{{ session.createdAt }} - {{ session.expiresAt }}</span>
              @if (session.current) {
                <em [attr.data-testid]="'active-session-current-' + session.sid">
                  {{ 'sessions.active.current' | stynxTranslate }}
                </em>
              }
            </div>
            @if (!session.current) {
              <button
                type="button"
                (click)="revoke(session.sid)"
                [attr.data-testid]="'active-session-revoke-' + session.sid"
              >
                {{ 'sessions.active.actions.revoke' | stynxTranslate }}
              </button>
            }
          </article>
        }
      </section>
      <button type="button" (click)="revokeOthers()" data-testid="active-sessions-revoke-others">
        {{ 'sessions.active.actions.revokeOthers' | stynxTranslate }}
      </button>
    }
  `,
  styles: [`
    .stynx-session-list {
      display: grid;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }

    .stynx-session-row {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.9rem 1rem;
      border-radius: 14px;
      background: var(--mat-sys-surface-container-low, #f8fafc);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxActiveSessionsComponent {
  private readonly session = inject(StynxSessionService);
  private readonly toast = inject(StynxToastService);
  private readonly changeDetector = inject(ChangeDetectorRef, { optional: true });

  @Input({ required: true }) adapter!: StynxSessionsAdapter;

  sessions: StynxActiveSession[] = [];

  async load(): Promise<void> {
    const currentSid = this.session.snapshot().sid;
    this.sessions = (await this.adapter.list()).map((entry) => ({
      ...entry,
      current: entry.sid === currentSid,
    }));
    this.changeDetector?.markForCheck();
  }

  async revoke(sid: string): Promise<void> {
    await this.adapter.revoke(sid);
    this.toast.push('Session revoked', 'warning');
    await this.load();
  }

  async revokeOthers(): Promise<void> {
    await this.adapter.revokeOthers();
    this.toast.push('Other sessions revoked', 'warning');
    await this.load();
  }
}
