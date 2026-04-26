import { ChangeDetectionStrategy, Component, Inject, Input } from '@angular/core';
import { StynxSessionService } from '@stynx-web/angular-auth';
import { EmptyStateComponent, StynxToastService } from '@stynx-web/angular-ui';
import type { StynxActiveSession, StynxSessionsAdapter } from './types';

@Component({
  selector: 'stynx-active-sessions',
  standalone: true,
  imports: [EmptyStateComponent],
  template: `
    @if (sessions.length === 0) {
      <stynx-empty-state title="No active sessions" description="Your active sessions will appear here."></stynx-empty-state>
    } @else {
      <section class="stynx-session-list">
        @for (session of sessions; track session.sid) {
          <article class="stynx-session-row">
            <div>
              <strong>{{ session.tenantId }}</strong>
              <span>{{ session.createdAt }} - {{ session.expiresAt }}</span>
              @if (session.current) {
                <em>Current session</em>
              }
            </div>
            @if (!session.current) {
              <button type="button" (click)="revoke(session.sid)">Revoke</button>
            }
          </article>
        }
      </section>
      <button type="button" (click)="revokeOthers()">Revoke all other sessions</button>
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
  @Input({ required: true }) adapter!: StynxSessionsAdapter;

  sessions: StynxActiveSession[] = [];

  constructor(
    @Inject(StynxSessionService)
    private readonly session: StynxSessionService,
    @Inject(StynxToastService)
    private readonly toast: StynxToastService,
  ) {}

  async load(): Promise<void> {
    const currentSid = this.session.snapshot().sid;
    this.sessions = (await this.adapter.list()).map((entry) => ({
      ...entry,
      current: entry.sid === currentSid,
    }));
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