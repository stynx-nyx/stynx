import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { StynxSessionService } from '@stynx-nyx/angular-auth';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxConfirmDialogComponent,
  StynxPaginationComponent,
  StynxTableComponent,
  StynxToastService,
} from '@stynx-nyx/angular-ui';
import { STYNX_DEFAULT_TRASH_KINDS, STYNX_TRASH_ADAPTER } from './tokens';
import type {
  StynxTrashAdapter,
  StynxTrashColumn,
  StynxTrashFilter,
  StynxTrashItem,
  StynxTrashKind,
  StynxTrashKindConfig,
  StynxTrashQuery,
} from './types';

const DAY_MS = 86_400_000;
type RelativeTimeFormatter = {
  format(value: number, unit: 'day'): string;
};
type RelativeTimeFormatterConstructor = new (
  locale: string,
  options: { numeric: 'auto' | 'always' },
) => RelativeTimeFormatter;

@Component({
  selector: 'stynx-trash-list',
  standalone: true,
  imports: [
    EmptyStateComponent,
    StynxBannerComponent,
    StynxConfirmDialogComponent,
    StynxPaginationComponent,
    StynxTableComponent,
    StynxTranslatePipe,
  ],
  template: `
    @if (errorMessage()) {
      <stynx-banner tone="warning" [message]="errorMessage()"></stynx-banner>
    }

    <nav class="stynx-trash-tabs" [attr.aria-label]="'trash.tabs.ariaLabel' | stynxTranslate">
      @for (kind of kinds; track kind.kind) {
        <button
          type="button"
          [attr.aria-selected]="activeKind() === kind.kind"
          [attr.data-active]="activeKind() === kind.kind"
          (click)="selectKind(kind.kind)"
        >
          {{ kind.label }}
        </button>
      }
    </nav>

    <div class="stynx-trash-filters" [attr.aria-label]="'trash.filters.ariaLabel' | stynxTranslate">
      <button
        type="button"
        [attr.data-active]="isFilterActive('last_7_days')"
        (click)="toggleFilter('last_7_days')"
      >
        {{ 'trash.filters.last7Days' | stynxTranslate }}
      </button>
      <button
        type="button"
        [attr.data-active]="isFilterActive('by_me')"
        (click)="toggleFilter('by_me')"
      >
        {{ 'trash.filters.byMe' | stynxTranslate }}
      </button>
      @if (filterByActor) {
        <button
          type="button"
          [attr.data-active]="isFilterActive('by_actor')"
          (click)="toggleFilter('by_actor')"
        >
          {{ 'trash.filters.byActor' | stynxTranslate }}
        </button>
      }
    </div>

    @if (selectedCount() > 0) {
      <div class="stynx-trash-bulk-toolbar" aria-live="polite">
        <strong>{{ 'trash.bulk.selected' | stynxTranslate: { count: selectedCount() } }}</strong>
        <button type="button" (click)="bulkRestore()">{{ 'trash.bulk.restore' | stynxTranslate }}</button>
        <button type="button" (click)="bulkHardDelete()">{{ 'trash.bulk.hardDelete' | stynxTranslate }}</button>
        <button type="button" (click)="clearSelection()">{{ 'trash.bulk.clear' | stynxTranslate }}</button>
      </div>
    }

    @if (rows().length === 0) {
      <stynx-empty-state
        [title]="'trash.empty.title' | stynxTranslate"
        [description]="'trash.empty.description' | stynxTranslate"
      ></stynx-empty-state>
    } @else {
      <stynx-table [columns]="resolvedColumns" [rows]="rows()"></stynx-table>
      <div class="stynx-trash-actions">
        @for (item of items(); track item.id) {
          <article class="stynx-trash-card" [attr.data-testid]="'trash-item-' + activeKind() + '-' + item.id">
            <label class="stynx-trash-select">
              <input
                type="checkbox"
                [attr.data-testid]="'trash-select-' + activeKind() + '-' + item.id"
                [checked]="isSelected(item.id)"
                (change)="toggleSelected(item.id)"
              />
              <span>{{ 'trash.item.select' | stynxTranslate }}</span>
            </label>
            <div>
              <strong>{{ item.label }}</strong>
              <span>{{ item.deletedAt }}</span>
              @if (item.deletedBy) {
                <span>{{ 'trash.item.deletedBy' | stynxTranslate: { actor: item.deletedBy } }}</span>
              }
              <span class="stynx-trash-retention">{{ retentionCountdown(item) }}</span>
            </div>
            <div class="stynx-trash-buttons">
              <button
                type="button"
                [attr.data-testid]="'trash-restore-' + activeKind() + '-' + item.id"
                (click)="restore(item.id)"
              >
                {{ 'trash.item.restore' | stynxTranslate }}
              </button>
              @if (mayHardDelete(item)) {
                <button
                  type="button"
                  [attr.data-testid]="'trash-hard-delete-' + activeKind() + '-' + item.id"
                  (click)="openConfirm(item.id)"
                >
                  {{ 'trash.item.hardDelete' | stynxTranslate }}
                </button>
              }
            </div>
          </article>
        }
      </div>
      <stynx-pagination
        [page]="pageIndex()"
        [pageSizeInput]="pageSize()"
        [totalItems]="total()"
        (pageChange)="setPage($event.pageIndex, $event.pageSize)"
      ></stynx-pagination>
    }

    <stynx-confirm-dialog
      [open]="confirmingId() !== null"
      [title]="'trash.confirmHardDelete.title' | stynxTranslate"
      [message]="'trash.confirmHardDelete.message' | stynxTranslate"
      [confirmLabel]="'trash.confirmHardDelete.confirm' | stynxTranslate"
      (confirm)="confirmHardDelete()"
      (dismissed)="confirmingId.set(null)"
    ></stynx-confirm-dialog>
  `,
  styles: [`
    .stynx-trash-tabs,
    .stynx-trash-filters,
    .stynx-trash-bulk-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      margin-block: 0.75rem;
    }

    .stynx-trash-tabs button,
    .stynx-trash-filters button,
    .stynx-trash-bulk-toolbar button,
    .stynx-trash-buttons button {
      border: 1px solid var(--mat-sys-outline-variant, #cbd5e1);
      border-radius: 8px;
      padding: 0.45rem 0.7rem;
      background: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-on-surface, #0f172a);
      cursor: pointer;
    }

    .stynx-trash-tabs button[data-active='true'],
    .stynx-trash-filters button[data-active='true'] {
      border-color: var(--mat-sys-primary, #2563eb);
      background: color-mix(in srgb, var(--mat-sys-primary, #2563eb) 12%, white);
    }

    .stynx-trash-bulk-toolbar {
      padding: 0.75rem;
      border: 1px solid var(--mat-sys-outline-variant, #cbd5e1);
      border-radius: 8px;
      background: var(--mat-sys-surface-container-low, #f8fafc);
    }

    .stynx-trash-actions {
      display: grid;
      gap: 0.75rem;
      margin-block: 1rem;
    }

    .stynx-trash-card {
      display: flex;
      justify-content: space-between;
      gap: 1rem;
      align-items: center;
      padding: 0.9rem 1rem;
      border-radius: 8px;
      background: var(--mat-sys-surface-container-low, #f8fafc);
    }

    .stynx-trash-card > div {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
    }

    .stynx-trash-card span {
      color: var(--mat-sys-on-surface-variant, #475569);
      font-size: 0.9rem;
    }

    .stynx-trash-select {
      display: inline-flex;
      gap: 0.4rem;
      align-items: center;
      color: var(--mat-sys-on-surface-variant, #475569);
      font-size: 0.9rem;
    }

    .stynx-trash-retention {
      width: fit-content;
      border-radius: 8px;
      padding: 0.2rem 0.45rem;
      background: var(--mat-sys-surface-container, #e2e8f0);
    }

    .stynx-trash-buttons {
      display: flex;
      gap: 0.75rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxTrashListComponent {
  private readonly session = inject(StynxSessionService);
  private readonly toast = inject(StynxToastService);
  private readonly providedAdapter = inject(STYNX_TRASH_ADAPTER, { optional: true });

  @Input() resource: StynxTrashKind = 'record';
  @Input() adapter: StynxTrashAdapter | null = null;
  @Input() kinds: StynxTrashKindConfig[] = STYNX_DEFAULT_TRASH_KINDS;
  @Input() columns: StynxTrashColumn[] = [
    { key: 'label', label: 'Item' },
    { key: 'deletedAt', label: 'Deleted at' },
  ];
  @Input() hardDeletePermission = 'archive:hard-delete:*';
  @Input() filterByActor: string | null = null;
  @Input() locale = 'en-US';

  readonly items = signal<StynxTrashItem[]>([]);
  readonly rows = signal<Array<Record<string, unknown>>>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly errorMessage = signal('');
  readonly confirmingId = signal<string | null>(null);
  readonly selectedKind = signal<StynxTrashKind | ''>('');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly activeFilters = signal<Set<StynxTrashFilter>>(new Set());
  readonly selectedCount = computed(() => this.selectedIds().size);

  get resolvedColumns(): StynxTrashColumn[] {
    return this.columns;
  }

  activeKind(): StynxTrashKind {
    return this.selectedKind() || this.resource || this.kinds[0]?.kind || 'record';
  }

  async load(): Promise<void> {
    const page = await this.activeAdapter().list(this.activeKind(), this.buildQuery());
    this.items.set(page.items);
    this.total.set(page.total);
    this.rows.set(page.items.map((item) => ({
      label: item.label,
      deletedAt: item.deletedAt,
      deletedBy: item.deletedBy ?? '',
      retention: this.retentionCountdown(item),
    })));
    this.selectedIds.update((selected) => new Set(
      [...selected].filter((id) => page.items.some((item) => item.id === id)),
    ));
    this.errorMessage.set('');
  }

  async setPage(pageIndex: number, pageSize: number): Promise<void> {
    this.pageIndex.set(pageIndex);
    this.pageSize.set(pageSize);
    await this.load();
  }

  async restore(id: string): Promise<void> {
    try {
      await this.activeAdapter().restore(this.activeKind(), id);
      this.toast.push('Restored from trash', 'success');
      await this.load();
    } catch (error) {
      const adapter = this.activeAdapter();
      if (this.requiresCascade(error) && adapter.restoreWithCascade) {
        await adapter.restoreWithCascade(this.activeKind(), id);
        this.toast.push('Restored with cascade', 'success');
        await this.load();
        return;
      }
      this.errorMessage.set(this.resolveMessage(error));
    }
  }

  openConfirm(id: string): void {
    this.confirmingId.set(id);
  }

  async confirmHardDelete(): Promise<void> {
    const id = this.confirmingId();
    this.confirmingId.set(null);
    const adapter = this.activeAdapter();
    if (!id || !adapter.hardDelete) {
      return;
    }
    await adapter.hardDelete(this.activeKind(), id);
    this.toast.push('Archived row removed permanently', 'warning');
    await this.load();
  }

  selectKind(kind: StynxTrashKind): Promise<void> {
    this.selectedKind.set(kind);
    this.pageIndex.set(0);
    this.clearSelection();
    return this.load();
  }

  toggleFilter(filter: StynxTrashFilter): Promise<void> {
    this.activeFilters.update((current) => {
      const next = new Set(current);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
    this.pageIndex.set(0);
    this.clearSelection();
    return this.load();
  }

  isFilterActive(filter: StynxTrashFilter): boolean {
    return this.activeFilters().has(filter);
  }

  toggleSelected(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  async bulkRestore(): Promise<void> {
    const ids = [...this.selectedIds()];
    if (ids.length === 0) {
      return;
    }
    const adapter = this.activeAdapter();
    if (adapter.bulkRestore) {
      await adapter.bulkRestore(this.activeKind(), ids);
    } else {
      await Promise.all(ids.map((id) => adapter.restore(this.activeKind(), id)));
    }
    this.toast.push('Restored selected items', 'success');
    this.clearSelection();
    await this.load();
  }

  async bulkHardDelete(): Promise<void> {
    const ids = [...this.selectedIds()];
    const adapter = this.activeAdapter();
    if (ids.length === 0 || (!adapter.hardDelete && !adapter.bulkHardDelete)) {
      return;
    }
    if (adapter.bulkHardDelete) {
      await adapter.bulkHardDelete(this.activeKind(), ids);
    } else if (adapter.hardDelete) {
      await Promise.all(ids.map((id) => adapter.hardDelete?.(this.activeKind(), id)));
    }
    this.toast.push('Selected items removed permanently', 'warning');
    this.clearSelection();
    await this.load();
  }

  mayHardDelete(item: StynxTrashItem): boolean {
    return Boolean(item.canHardDelete) && this.session.hasAllPermissions([this.hardDeletePermission]);
  }

  retentionCountdown(item: StynxTrashItem): string {
    if (!item.autoPurgeAt) {
      return 'No purge scheduled';
    }
    const timestamp = Date.parse(item.autoPurgeAt);
    if (!Number.isFinite(timestamp)) {
      return 'No purge scheduled';
    }
    const days = Math.round((timestamp - Date.now()) / DAY_MS);
    const relativeTimeFormat = (Intl as typeof Intl & {
      RelativeTimeFormat: RelativeTimeFormatterConstructor;
    }).RelativeTimeFormat;
    const formatter = new relativeTimeFormat(this.locale, { numeric: 'auto' });
    if (days < 0) {
      return `Purge overdue ${formatter.format(days, 'day')}`;
    }
    return `Purges ${formatter.format(days, 'day')}`;
  }

  private activeAdapter(): StynxTrashAdapter {
    const adapter = this.adapter ?? this.providedAdapter;
    if (!adapter) {
      throw new Error('StynxTrashListComponent requires an adapter input or provideStynxTrash(...).');
    }
    return adapter;
  }

  private buildQuery(): StynxTrashQuery {
    const query: StynxTrashQuery = {
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      sort: 'deleted_at_desc',
    };

    if (this.activeFilters().has('last_7_days')) {
      query.deletedSince = new Date(Date.now() - 7 * DAY_MS).toISOString();
    }

    const deletedBy = this.deletedByFilter();
    if (deletedBy) {
      query.deletedBy = deletedBy;
    }

    return query;
  }

  private deletedByFilter(): string | undefined {
    if (this.activeFilters().has('by_actor') && this.filterByActor) {
      return this.filterByActor;
    }
    if (!this.activeFilters().has('by_me')) {
      return undefined;
    }
    const snapshot = this.session.snapshot();
    const sub = snapshot.claims?.['sub'];
    return typeof sub === 'string' ? sub : snapshot.sid ?? undefined;
  }

  private requiresCascade(error: unknown): boolean {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
    return code.includes('RESTORE');
  }

  private resolveMessage(error: unknown): string {
    if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') {
      return error.message;
    }
    return 'Unable to update trash item.';
  }
}
