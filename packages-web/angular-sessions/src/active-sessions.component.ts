import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { StynxSessionService } from '@stynx-nyx/angular-auth';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { EmptyStateComponent, StynxConfirmDialogComponent, StynxToastService } from '@stynx-nyx/angular-ui';
import { firstValueFrom, from } from 'rxjs';
import type { Observable } from 'rxjs';
import { STYNX_SESSIONS_ADAPTER } from './tokens';
import type { StynxActiveSession, StynxSessionsAdapter } from './types';

@Component({
  selector: 'stynx-active-sessions',
  standalone: true,
  imports: [EmptyStateComponent, StynxConfirmDialogComponent, StynxTranslatePipe],
  template: `
    @if (sessionsState().length === 0) {
      <stynx-empty-state
        [title]="'sessions.active.empty.title' | stynxTranslate"
        [description]="'sessions.active.empty.description' | stynxTranslate"
        data-testid="active-sessions-empty"
      ></stynx-empty-state>
    } @else {
      <section class="stynx-session-list" data-testid="active-sessions-list">
        @for (session of sessionsState(); track session.sid) {
          <article class="stynx-session-row" [attr.data-testid]="'active-session-row-' + session.sid">
            <div class="stynx-session-summary">
              <div class="stynx-session-heading">
                <strong [attr.data-testid]="'active-session-tenant-' + session.sid">{{ session.tenantId }}</strong>
                @if (session.current) {
                  <em [attr.data-testid]="'active-session-current-' + session.sid">
                    {{ 'sessions.active.current' | stynxTranslate }}
                  </em>
                }
              </div>
              <dl>
                <div>
                  <dt>{{ 'sessions.active.columns.createdAt' | stynxTranslate }}</dt>
                  <dd>{{ session.createdAt }}</dd>
                </div>
                <div>
                  <dt>{{ 'sessions.active.columns.expiresAt' | stynxTranslate }}</dt>
                  <dd>{{ session.expiresAt }}</dd>
                </div>
                <div>
                  <dt>{{ 'sessions.active.columns.lastSeenAt' | stynxTranslate }}</dt>
                  <dd [attr.data-testid]="'active-session-last-seen-' + session.sid">
                    {{ session.lastSeenAt || ('sessions.active.values.unknown' | stynxTranslate) }}
                  </dd>
                </div>
                <div>
                  <dt>{{ 'sessions.active.columns.lastIp' | stynxTranslate }}</dt>
                  <dd [attr.data-testid]="'active-session-last-ip-' + session.sid">
                    {{ session.lastIp || ('sessions.active.values.unknown' | stynxTranslate) }}
                  </dd>
                </div>
                <div>
                  <dt>{{ 'sessions.active.columns.userAgent' | stynxTranslate }}</dt>
                  <dd
                    class="stynx-session-user-agent"
                    [title]="session.userAgent || ''"
                    [attr.data-testid]="'active-session-user-agent-' + session.sid"
                  >
                    {{ session.userAgent || ('sessions.active.values.unknown' | stynxTranslate) }}
                  </dd>
                </div>
              </dl>
            </div>
            <div class="stynx-session-actions">
              @if (session.current) {
                <span class="stynx-session-current-label">
                  {{ 'sessions.active.labels.thisDevice' | stynxTranslate }}
                </span>
              } @else {
                <button
                  type="button"
                  (click)="revoke(session.sid)"
                  [disabled]="busy()"
                  [attr.data-testid]="'active-session-revoke-' + session.sid"
                >
                  {{ 'sessions.active.actions.revoke' | stynxTranslate }}
                </button>
              }
            </div>
          </article>
        }
      </section>
      <button
        type="button"
        (click)="confirmingRevokeOthers.set(true)"
        [disabled]="busy()"
        data-testid="active-sessions-revoke-others"
      >
        {{ 'sessions.active.actions.revokeOthers' | stynxTranslate }}
      </button>
      <stynx-confirm-dialog
        [open]="confirmingRevokeOthers()"
        [title]="'sessions.active.confirmRevokeOthers.title' | stynxTranslate"
        [message]="'sessions.active.confirmRevokeOthers.message' | stynxTranslate"
        [confirmLabel]="'sessions.active.confirmRevokeOthers.confirm' | stynxTranslate"
        (confirm)="revokeOthers()"
        (dismissed)="confirmingRevokeOthers.set(false)"
      ></stynx-confirm-dialog>
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
      border-radius: 8px;
      background: var(--mat-sys-surface-container-low, #f8fafc);
    }

    .stynx-session-summary {
      display: grid;
      gap: 0.75rem;
      min-width: 0;
    }

    .stynx-session-heading,
    .stynx-session-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .stynx-session-heading em,
    .stynx-session-current-label {
      display: inline-flex;
      align-items: center;
      min-height: 1.5rem;
      padding: 0 0.5rem;
      border-radius: 999px;
      color: var(--mat-sys-on-primary-container, #0f172a);
      background: var(--mat-sys-primary-container, #dbeafe);
      font-size: 0.78rem;
      font-style: normal;
      font-weight: 600;
    }

    dl {
      display: grid;
      grid-template-columns: repeat(5, minmax(8rem, 1fr));
      gap: 0.75rem;
      margin: 0;
    }

    dt {
      color: var(--mat-sys-on-surface-variant, #64748b);
      font-size: 0.78rem;
      font-weight: 600;
    }

    dd {
      margin: 0.2rem 0 0;
      overflow-wrap: anywhere;
    }

    .stynx-session-user-agent {
      max-width: 18rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    @media (max-width: 860px) {
      .stynx-session-row,
      .stynx-session-actions {
        align-items: stretch;
        flex-direction: column;
      }

      dl {
        grid-template-columns: 1fr;
      }

      .stynx-session-user-agent {
        max-width: 100%;
        white-space: normal;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxActiveSessionsComponent {
  private readonly session = inject(StynxSessionService);
  private readonly toast = inject(StynxToastService);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly adapterFromProvider = inject(STYNX_SESSIONS_ADAPTER, { optional: true });

  @Input() adapter?: StynxSessionsAdapter;

  readonly sessionsState = signal<StynxActiveSession[]>([]);
  readonly confirmingRevokeOthers = signal(false);
  readonly busy = signal(false);

  get sessions(): StynxActiveSession[] {
    return this.sessionsState();
  }

  async load(): Promise<void> {
    const currentSid = this.session.snapshot().sid;
    const sessions = await this.resolve(this.resolvedAdapter.list());
    this.sessionsState.set(sessions.map((entry) => ({
      ...entry,
      current: entry.current ?? entry.sid === currentSid,
    })));
  }

  async revoke(sid: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.resolve(this.resolvedAdapter.revoke(sid));
      this.toast.push(this.translate('sessions.active.toast.revoked'), 'warning');
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }

  async revokeOthers(): Promise<void> {
    this.confirmingRevokeOthers.set(false);
    this.busy.set(true);
    try {
      await this.resolve(this.resolvedAdapter.revokeOthers());
      this.toast.push(this.translate('sessions.active.toast.revokedOthers'), 'warning');
      await this.load();
    } finally {
      this.busy.set(false);
    }
  }

  private get resolvedAdapter(): StynxSessionsAdapter {
    const adapter = this.adapter ?? this.adapterFromProvider;
    if (!adapter) {
      throw new Error('StynxActiveSessionsComponent requires an adapter input or provideStynxSessions(...).');
    }
    return adapter;
  }

  private resolve<T>(source: Promise<T> | Observable<T>): Promise<T> {
    return firstValueFrom(from(source));
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
