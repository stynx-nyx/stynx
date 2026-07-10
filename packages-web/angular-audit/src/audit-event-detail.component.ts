import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
} from '@stynx-nyx/angular-ui';
import { finalize } from 'rxjs';
import { AuditApiService } from './audit-api.service';
import type { AuditEventDetail, AuditIntegrityReport } from './types';

function stringify(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Audit request failed';
}

@Component({
  selector: 'stynx-audit-event-detail',
  standalone: true,
  imports: [
    EmptyStateComponent,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-audit-event-detail">
      @if (!eventIdValue()) {
        <stynx-empty-state
          [title]="'audit.detail.empty.title' | stynxTranslate"
          [description]="'audit.detail.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <header class="detail-header">
          <div>
            <h2>{{ 'audit.detail.title' | stynxTranslate }}</h2>
            <p>{{ eventIdValue() }}</p>
          </div>
          <button type="button" (click)="verifyIntegrity()" [disabled]="integrityLoading() || loading()">
            <stynx-icon name="check" aria-hidden="true"></stynx-icon>
            {{ 'audit.detail.verifyIntegrity' | stynxTranslate }}
          </button>
        </header>

        @if (error()) {
          <stynx-banner
            tone="error"
            [title]="'audit.detail.errorTitle' | stynxTranslate"
            [message]="error()"
          ></stynx-banner>
        }

        @if (integrityError()) {
          <stynx-banner
            tone="warning"
            [title]="'audit.detail.integrityUnknownTitle' | stynxTranslate"
            [message]="integrityError()"
          ></stynx-banner>
        }

        @if (loading()) {
          <stynx-loading-spinner [label]="'audit.detail.loading' | stynxTranslate"></stynx-loading-spinner>
        } @else if (event()) {
          <article class="event-shell">
            <dl class="summary-grid">
              <div>
                <dt>{{ 'audit.fields.actor' | stynxTranslate }}</dt>
                <dd>{{ actorLabel() }}</dd>
              </div>
              <div>
                <dt>{{ 'audit.fields.action' | stynxTranslate }}</dt>
                <dd><code>{{ event()?.action }}</code></dd>
              </div>
              <div>
                <dt>{{ 'audit.fields.entity' | stynxTranslate }}</dt>
                <dd>{{ entityLabel() }}</dd>
              </div>
              <div>
                <dt>{{ 'audit.fields.timestamp' | stynxTranslate }}</dt>
                <dd>{{ formatTimestamp(event()?.occurredAt || '') }}</dd>
              </div>
              <div>
                <dt>{{ 'audit.fields.requestId' | stynxTranslate }}</dt>
                <dd>{{ event()?.requestId || '-' }}</dd>
              </div>
              <div>
                <dt>{{ 'audit.fields.sessionId' | stynxTranslate }}</dt>
                <dd>{{ event()?.sessionId || '-' }}</dd>
              </div>
            </dl>

            @if (integrity()) {
              <section class="integrity-panel" [attr.data-tone]="integrityTone()">
                <strong>{{ integrityTitleKey() | stynxTranslate }}</strong>
                <span>
                  {{ 'audit.detail.integrityCheckedThrough' | stynxTranslate: {
                    eventId: integrity()?.checkedThroughEventId || '',
                    total: integrity()?.totalChecked || 0
                  } }}
                </span>
                @if (integrity()?.firstBrokenEventId) {
                  <span>{{ 'audit.detail.firstBrokenEvent' | stynxTranslate }}: {{ integrity()?.firstBrokenEventId }}</span>
                }
              </section>
            }

            <section class="diff-grid">
              <div>
                <h3>{{ 'audit.detail.before' | stynxTranslate }}</h3>
                <pre>{{ beforeJson() }}</pre>
              </div>
              <div>
                <h3>{{ 'audit.detail.after' | stynxTranslate }}</h3>
                <pre>{{ afterJson() }}</pre>
              </div>
            </section>

            <section class="payload-grid">
              <div>
                <h3>{{ 'audit.detail.metadata' | stynxTranslate }}</h3>
                <pre>{{ metadataJson() }}</pre>
              </div>
              <div>
                <h3>{{ 'audit.detail.hashes' | stynxTranslate }}</h3>
                <dl>
                  <div>
                    <dt>{{ 'audit.fields.previousHash' | stynxTranslate }}</dt>
                    <dd><code>{{ event()?.previousHash || '-' }}</code></dd>
                  </div>
                  <div>
                    <dt>{{ 'audit.fields.rowHash' | stynxTranslate }}</dt>
                    <dd><code>{{ event()?.rowHash || '-' }}</code></dd>
                  </div>
                </dl>
              </div>
            </section>
          </article>
        }
      }
    </section>
  `,
  styles: [`
    .stynx-audit-event-detail,
    .event-shell {
      display: grid;
      gap: 1rem;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .detail-header {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      justify-content: space-between;
      gap: 0.75rem;
    }

    h2,
    h3,
    p,
    dl,
    dd {
      margin: 0;
    }

    h2 {
      font-size: 1.15rem;
    }

    h3 {
      font-size: 0.95rem;
    }

    p,
    dt {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    button {
      border: 1px solid var(--mat-sys-outline-variant, #cbd5e1);
      border-radius: 8px;
      background: var(--mat-sys-primary, #2563eb);
      color: var(--mat-sys-on-primary, #ffffff);
      padding: 0.6rem 0.85rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font: inherit;
      font-weight: 650;
    }

    button:disabled {
      opacity: 0.58;
    }

    .summary-grid,
    .diff-grid,
    .payload-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
      gap: 0.85rem;
    }

    .summary-grid > div,
    .integrity-panel,
    .diff-grid > div,
    .payload-grid > div {
      border: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
      border-radius: 8px;
      padding: 0.85rem;
      background: var(--mat-sys-surface, #ffffff);
      min-width: 0;
    }

    .summary-grid > div,
    .integrity-panel,
    .payload-grid dl,
    .payload-grid dl > div {
      display: grid;
      gap: 0.35rem;
    }

    .integrity-panel[data-tone='valid'] {
      border-color: #86efac;
      background: #dcfce7;
    }

    .integrity-panel[data-tone='broken'] {
      border-color: #fecaca;
      background: #fee2e2;
    }

    pre {
      max-height: 24rem;
      overflow: auto;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-low, #f8fafc);
      padding: 0.85rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    code,
    pre {
      font: 0.86rem ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxAuditEventDetailComponent {
  readonly eventIdValue = signal('');
  readonly event = signal<AuditEventDetail | null>(null);
  readonly integrity = signal<AuditIntegrityReport | null>(null);
  readonly loading = signal(false);
  readonly integrityLoading = signal(false);
  readonly error = signal('');
  readonly integrityError = signal('');
  readonly actorLabel = computed(() => {
    const event = this.event();
    return event?.actor.displayName || event?.actor.id || 'System';
  });
  readonly entityLabel = computed(() => {
    const event = this.event();
    if (!event) {
      return '';
    }
    return event.entity.label || event.entity.id || event.entity.kind;
  });
  readonly beforeJson = computed(() => stringify(this.event()?.before));
  readonly afterJson = computed(() => stringify(this.event()?.after));
  readonly metadataJson = computed(() => stringify(this.event()?.metadata));
  readonly integrityTone = computed(() => this.integrity()?.valid ? 'valid' : 'broken');
  readonly integrityTitleKey = computed(() => (
    this.integrity()?.valid ? 'audit.integrity.valid' : 'audit.integrity.broken'
  ));

  private readonly api = inject(AuditApiService);

  @Input({ required: true })
  set eventId(value: string) {
    const next = value.trim();
    this.eventIdValue.set(next);
    this.integrity.set(null);
    this.integrityError.set('');
    if (next) {
      this.load(next);
    } else {
      this.event.set(null);
    }
  }

  verifyIntegrity(): void {
    const eventId = this.eventIdValue();
    if (!eventId) {
      return;
    }
    this.integrityLoading.set(true);
    this.integrityError.set('');
    this.api.verifyHashIntegrity(eventId).pipe(
      finalize(() => this.integrityLoading.set(false)),
    ).subscribe({
      next: (report) => this.integrity.set(report),
      error: (error) => this.integrityError.set(errorMessage(error)),
    });
  }

  formatTimestamp(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  private load(eventId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getEvent(eventId).pipe(
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (event) => this.event.set(event),
      error: (error) => {
        this.event.set(null);
        this.error.set(errorMessage(error));
      },
    });
  }
}
