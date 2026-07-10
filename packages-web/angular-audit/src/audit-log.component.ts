import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
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
import type { AuditEventSummary, AuditFilter } from './types';

const DEFAULT_PAGE_SIZE = 25;

function compactFilter(filter: AuditFilter): AuditFilter {
  const next: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filter)) {
    if (typeof value === 'string' && value.trim()) {
      next[key] = value.trim();
    } else if (typeof value === 'number') {
      next[key] = value;
    }
  }
  return next;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Audit request failed';
}

@Component({
  selector: 'stynx-audit-log',
  standalone: true,
  imports: [
    EmptyStateComponent,
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxPaginationComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-audit-log">
      <header class="audit-header">
        <div>
          <h2>{{ 'audit.log.title' | stynxTranslate }}</h2>
          <p>{{ 'audit.log.description' | stynxTranslate }}</p>
        </div>
        <button type="button" class="secondary" (click)="refresh()" [disabled]="loading()">
          <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
          {{ 'audit.actions.refresh' | stynxTranslate }}
        </button>
      </header>

      <form class="audit-toolbar" [formGroup]="filterForm" (ngSubmit)="applyFilters()">
        <label class="search-field">
          <span>{{ 'audit.filters.search.label' | stynxTranslate }}</span>
          <input
            type="search"
            formControlName="search"
            [placeholder]="'audit.filters.search.placeholder' | stynxTranslate"
          />
        </label>
        <label>
          <span>{{ 'audit.filters.actor' | stynxTranslate }}</span>
          <input type="text" formControlName="actorId" />
        </label>
        <label>
          <span>{{ 'audit.filters.action' | stynxTranslate }}</span>
          <input type="text" formControlName="action" />
        </label>
        <label>
          <span>{{ 'audit.filters.entityKind' | stynxTranslate }}</span>
          <input type="text" formControlName="entityKind" />
        </label>
        <label>
          <span>{{ 'audit.filters.entityId' | stynxTranslate }}</span>
          <input type="text" formControlName="entityId" />
        </label>
        <div class="toolbar-actions">
          <button type="submit" [disabled]="loading()">
            <stynx-icon name="check" aria-hidden="true"></stynx-icon>
            {{ 'audit.actions.applyFilters' | stynxTranslate }}
          </button>
          <button type="button" class="secondary" (click)="clearFilters()" [disabled]="loading()">
            {{ 'audit.actions.clearFilters' | stynxTranslate }}
          </button>
        </div>
      </form>

      @if (activeFilterChips().length > 0) {
        <div class="filter-chips" aria-live="polite">
          @for (chip of activeFilterChips(); track chip) {
            <span class="filter-chip">{{ chip }}</span>
          }
        </div>
      }

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'audit.log.errorTitle' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner [label]="'audit.log.loading' | stynxTranslate"></stynx-loading-spinner>
      } @else if (events().length === 0) {
        <stynx-empty-state
          [title]="'audit.log.empty.title' | stynxTranslate"
          [description]="'audit.log.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <div class="audit-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{{ 'audit.fields.actor' | stynxTranslate }}</th>
                <th>{{ 'audit.fields.action' | stynxTranslate }}</th>
                <th>{{ 'audit.fields.entity' | stynxTranslate }}</th>
                <th>{{ 'audit.fields.timestamp' | stynxTranslate }}</th>
                <th>{{ 'audit.fields.integrity' | stynxTranslate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (event of events(); track event.eventId) {
                <tr>
                  <td>
                    <strong>{{ actorLabel(event) }}</strong>
                    @if (event.actor.role) {
                      <span>{{ event.actor.role }}</span>
                    }
                  </td>
                  <td>
                    <code>{{ event.action }}</code>
                  </td>
                  <td>
                    <strong>{{ entityLabel(event) }}</strong>
                    <span>{{ event.entity.kind }}</span>
                  </td>
                  <td>
                    <time [attr.datetime]="event.occurredAt">{{ formatTimestamp(event.occurredAt) }}</time>
                  </td>
                  <td>
                    <span class="integrity-badge" [attr.data-tone]="event.integrity">
                      {{ integrityLabel(event.integrity) | stynxTranslate }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <stynx-pagination
          [page]="pageIndex()"
          [pageSizeInput]="pageSize()"
          [totalItems]="virtualTotal()"
          (pageChange)="pageChanged($event.pageIndex)"
        ></stynx-pagination>
      }
    </section>
  `,
  styles: [`
    .stynx-audit-log,
    .audit-toolbar,
    .filter-chips {
      display: grid;
      gap: 1rem;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .audit-header,
    .toolbar-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      justify-content: space-between;
      gap: 0.75rem;
    }

    .audit-toolbar {
      grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
      align-items: end;
    }

    .search-field {
      grid-column: span 2;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 1.15rem;
    }

    p,
    td span {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    label,
    td {
      display: grid;
      gap: 0.35rem;
    }

    label {
      font-weight: 650;
    }

    input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.65rem 0.75rem;
      color: inherit;
      background: var(--mat-sys-surface, #ffffff);
      font: inherit;
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

    button.secondary {
      background: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-primary, #2563eb);
    }

    button:disabled {
      opacity: 0.58;
    }

    .filter-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .filter-chip,
    .integrity-badge {
      border-radius: 999px;
      border: 1px solid var(--mat-sys-outline-variant, #cbd5e1);
      padding: 0.2rem 0.55rem;
      background: var(--mat-sys-surface-container-low, #f8fafc);
      font-size: 0.82rem;
      font-weight: 650;
    }

    .audit-table-wrap {
      overflow-x: auto;
      border: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
      border-radius: 8px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--mat-sys-surface, #ffffff);
    }

    th,
    td {
      padding: 0.8rem 1rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
      text-align: left;
      vertical-align: top;
    }

    th {
      color: var(--mat-sys-on-surface-variant, #475569);
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    code {
      overflow-wrap: anywhere;
      font: 0.9rem ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .integrity-badge[data-tone='valid'] {
      border-color: color-mix(in srgb, var(--mat-sys-primary, #16a34a) 50%, transparent);
      color: #166534;
      background: #dcfce7;
    }

    .integrity-badge[data-tone='broken'] {
      border-color: color-mix(in srgb, var(--mat-sys-error, #dc2626) 50%, transparent);
      color: #991b1b;
      background: #fee2e2;
    }

    .integrity-badge[data-tone='unchecked'] {
      border-color: #f59e0b;
      color: #92400e;
      background: #fef3c7;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxAuditLogComponent {
  private readonly api = inject(AuditApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly cursorByPage = signal<Array<string | undefined>>([undefined]);
  private readonly nextCursor = signal<string | undefined>(undefined);
  private readonly activeFilter = signal<AuditFilter>({ limit: DEFAULT_PAGE_SIZE });

  readonly events = signal<AuditEventSummary[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly pageIndex = signal(0);
  readonly pageSize = signal(DEFAULT_PAGE_SIZE);
  readonly virtualTotal = computed(() => (
    (this.pageIndex() + 1) * this.pageSize() + (this.nextCursor() ? this.pageSize() : 0)
  ));
  readonly activeFilterChips = computed(() => {
    const filter = this.activeFilter();
    return Object.entries(filter)
      .filter(([key, value]) => key !== 'limit' && value !== undefined && value !== '')
      .map(([key, value]) => `${key}: ${value}`);
  });

  readonly filterForm = this.formBuilder.group({
    search: [''],
    actorId: [''],
    action: [''],
    entityKind: [''],
    entityId: [''],
  });

  constructor() {
    this.loadPage(0);
  }

  applyFilters(): void {
    const value = this.filterForm.getRawValue();
    const search = value.search.trim();
    const filter = compactFilter({
      actorId: value.actorId,
      action: value.action || search,
      entityKind: value.entityKind,
      entityId: value.entityId,
      limit: this.pageSize(),
    });
    this.activeFilter.set(filter);
    this.cursorByPage.set([undefined]);
    this.loadPage(0);
  }

  clearFilters(): void {
    this.filterForm.reset();
    this.activeFilter.set({ limit: this.pageSize() });
    this.cursorByPage.set([undefined]);
    this.loadPage(0);
  }

  refresh(): void {
    this.loadPage(this.pageIndex());
  }

  pageChanged(nextPage: number): void {
    if (nextPage === this.pageIndex()) {
      return;
    }
    this.loadPage(nextPage);
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

  integrityLabel(value: AuditEventSummary['integrity']): string {
    return `audit.integrity.${value}`;
  }

  private loadPage(nextPage: number): void {
    const cursor = this.cursorByPage()[nextPage];
    this.loading.set(true);
    this.error.set('');
    this.api.listEvents(this.activeFilter(), cursor).pipe(
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
      error: (error) => {
        this.error.set(errorMessage(error));
      },
    });
  }
}
