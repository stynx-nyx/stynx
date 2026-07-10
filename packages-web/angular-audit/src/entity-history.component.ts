import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
  StynxPaginationComponent,
} from '@stynx-nyx/angular-ui';
import { finalize } from 'rxjs';
import { AuditApiService } from './audit-api.service';
import { StynxAuditHashIntegrityBadgeComponent } from './audit-hash-integrity-badge.component';
import type { AuditEventSummary } from './types';

const DEFAULT_PAGE_SIZE = 25;

function stringify(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Audit entity history request failed';
}

@Component({
  selector: 'stynx-entity-history',
  standalone: true,
  imports: [
    EmptyStateComponent,
    StynxAuditHashIntegrityBadgeComponent,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxPaginationComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-entity-history">
      <header class="history-header">
        <div>
          <h2>{{ 'audit.history.title' | stynxTranslate }}</h2>
          <p>{{ resourceValue() }} / {{ idValue() }}</p>
        </div>
        <button type="button" class="secondary" (click)="refresh()" [disabled]="loading() || !canLoad()">
          <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
          {{ 'audit.actions.refresh' | stynxTranslate }}
        </button>
      </header>

      @if (!canLoad()) {
        <stynx-empty-state
          [title]="'audit.history.emptyInput.title' | stynxTranslate"
          [description]="'audit.history.emptyInput.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        @if (error()) {
          <stynx-banner
            tone="error"
            [title]="'audit.history.errorTitle' | stynxTranslate"
            [message]="error()"
          ></stynx-banner>
        }

        @if (loading()) {
          <stynx-loading-spinner [label]="'audit.history.loading' | stynxTranslate"></stynx-loading-spinner>
        } @else if (events().length === 0) {
          <stynx-empty-state
            [title]="'audit.history.empty.title' | stynxTranslate"
            [description]="'audit.history.empty.description' | stynxTranslate"
          ></stynx-empty-state>
        } @else {
          <ol class="history-timeline">
            @for (event of events(); track event.eventId) {
              <li>
                <article class="history-card">
                  <header>
                    <div>
                      <strong><code>{{ event.action }}</code></strong>
                      <span>{{ actorLabel(event) }}</span>
                    </div>
                    <time [attr.datetime]="event.occurredAt">{{ formatTimestamp(event.occurredAt) }}</time>
                  </header>
                  <div class="history-meta">
                    <span>{{ entityLabel(event) }}</span>
                    <stynx-audit-hash-integrity [eventId]="event.eventId"></stynx-audit-hash-integrity>
                  </div>
                  @if (diffText(event) !== '{}') {
                    <pre>{{ diffText(event) }}</pre>
                  }
                </article>
              </li>
            }
          </ol>

          <stynx-pagination
            [page]="pageIndex()"
            [pageSizeInput]="pageSize()"
            [totalItems]="virtualTotal()"
            (pageChange)="pageChanged($event.pageIndex)"
          ></stynx-pagination>
        }
      }
    </section>
  `,
  styles: [`
    .stynx-entity-history {
      display: grid;
      gap: 1rem;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .history-header,
    .history-card header,
    .history-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
    }

    h2,
    p,
    ol {
      margin: 0;
    }

    h2 {
      font-size: 1.15rem;
    }

    p,
    time,
    .history-card span {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    button {
      border: 1px solid var(--mat-sys-outline-variant, #cbd5e1);
      border-radius: 8px;
      background: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-primary, #2563eb);
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

    .history-timeline {
      display: grid;
      gap: 0.85rem;
      padding: 0;
      list-style: none;
    }

    .history-card {
      display: grid;
      gap: 0.75rem;
      border: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
      border-radius: 8px;
      padding: 0.85rem;
      background: var(--mat-sys-surface, #ffffff);
    }

    .history-card header > div {
      display: grid;
      gap: 0.25rem;
      min-width: 0;
    }

    code,
    pre {
      font: 0.86rem ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    pre {
      max-height: 18rem;
      overflow: auto;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-low, #f8fafc);
      padding: 0.85rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxEntityHistoryComponent {
  private readonly api = inject(AuditApiService);
  private readonly cursorByPage = signal<Array<string | undefined>>([undefined]);
  private readonly nextCursor = signal<string | undefined>(undefined);

  readonly resourceValue = signal('');
  readonly idValue = signal('');
  readonly events = signal<AuditEventSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly canLoad = computed(() => Boolean(this.resourceValue() && this.idValue()));
  readonly virtualTotal = computed(() => (
    (this.pageIndex() + 1) * this.pageSize() + (this.nextCursor() ? this.pageSize() : 0)
  ));

  @Input({ required: true })
  set resource(value: string) {
    this.resourceValue.set(value.trim());
    this.resetAndLoad();
  }

  @Input({ required: true })
  set id(value: string) {
    this.idValue.set(value.trim());
    this.resetAndLoad();
  }

  refresh(): void {
    if (this.canLoad()) {
      this.loadPage(this.pageIndex());
    }
  }

  pageChanged(nextPage: number): void {
    if (nextPage !== this.pageIndex()) {
      this.loadPage(nextPage);
    }
  }

  actorLabel(event: AuditEventSummary): string {
    return event.actor.displayName || event.actor.id || 'System';
  }

  entityLabel(event: AuditEventSummary): string {
    return event.entity.label || event.entity.id || event.entity.kind;
  }

  formatTimestamp(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  diffText(event: AuditEventSummary): string {
    const maybeDetail = event as AuditEventSummary & {
      before?: Record<string, unknown> | null;
      after?: Record<string, unknown> | null;
      metadata?: Record<string, unknown> | null;
    };
    return stringify({
      before: maybeDetail.before ?? undefined,
      after: maybeDetail.after ?? undefined,
      metadata: maybeDetail.metadata ?? undefined,
    });
  }

  private resetAndLoad(): void {
    this.cursorByPage.set([undefined]);
    this.nextCursor.set(undefined);
    this.pageIndex.set(0);
    if (this.canLoad()) {
      this.loadPage(0);
    } else {
      this.events.set([]);
    }
  }

  private loadPage(nextPage: number): void {
    const resource = this.resourceValue();
    const id = this.idValue();
    if (!resource || !id) {
      return;
    }
    const cursor = this.cursorByPage()[nextPage];
    this.loading.set(true);
    this.error.set('');
    this.api.listEntityHistory(resource, id, cursor, { limit: this.pageSize() }).pipe(
      finalize(() => this.loading.set(false)),
    ).subscribe({
      next: (page) => {
        this.events.set(page.items);
        this.pageIndex.set(nextPage);
        this.nextCursor.set(page.nextCursor);
        const cursors = [...this.cursorByPage()];
        cursors[nextPage + 1] = page.nextCursor;
        this.cursorByPage.set(cursors);
      },
      error: (error) => this.error.set(errorMessage(error)),
    });
  }
}
