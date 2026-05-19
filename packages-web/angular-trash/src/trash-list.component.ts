import { ChangeDetectionStrategy, Component, Input, inject, signal } from '@angular/core';
import { StynxSessionService } from '@stynx-web/angular-auth';
import { StynxBannerComponent, StynxConfirmDialogComponent, EmptyStateComponent, StynxPaginationComponent, StynxTableComponent } from '@stynx-web/angular-ui';
import { StynxToastService } from '@stynx-web/angular-ui';
import type { StynxTrashAdapter, StynxTrashColumn, StynxTrashItem } from './types';

@Component({
  selector: 'stynx-trash-list',
  standalone: true,
  imports: [
    EmptyStateComponent,
    StynxBannerComponent,
    StynxConfirmDialogComponent,
    StynxPaginationComponent,
    StynxTableComponent,
  ],
  template: `
    @if (errorMessage()) {
      <stynx-banner tone="warning" [message]="errorMessage()"></stynx-banner>
    }

    @if (rows().length === 0) {
      <stynx-empty-state title="Trash is empty" description="Deleted records will appear here."></stynx-empty-state>
    } @else {
      <stynx-table [columns]="resolvedColumns" [rows]="rows()"></stynx-table>
      <div class="stynx-trash-actions">
        @for (item of items(); track item.id) {
          <article class="stynx-trash-card">
            <div>
              <strong>{{ item.label }}</strong>
              <span>{{ item.deletedAt }}</span>
            </div>
            <div class="stynx-trash-buttons">
              <button type="button" (click)="restore(item.id)">Restore</button>
              @if (mayHardDelete(item)) {
                <button type="button" (click)="openConfirm(item.id)">Hard delete</button>
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
      title="Hard delete"
      message="This permanently removes the archived row."
      confirmLabel="Delete forever"
      (confirm)="confirmHardDelete()"
      (cancel)="confirmingId.set(null)"
    ></stynx-confirm-dialog>
  `,
  styles: [`
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
      border-radius: 14px;
      background: var(--mat-sys-surface-container-low, #f8fafc);
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

  @Input({ required: true }) resource = '';
  @Input({ required: true }) adapter!: StynxTrashAdapter;
  @Input() columns: StynxTrashColumn[] = [
    { key: 'label', label: 'Item' },
    { key: 'deletedAt', label: 'Deleted at' },
  ];
  @Input() hardDeletePermission = 'archive:hard-delete:*';

  readonly items = signal<StynxTrashItem[]>([]);
  readonly rows = signal<Array<Record<string, unknown>>>([]);
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly errorMessage = signal('');
  readonly confirmingId = signal<string | null>(null);

  get resolvedColumns(): StynxTrashColumn[] {
    return this.columns;
  }

  async load(): Promise<void> {
    const page = await this.adapter.list(this.resource, {
      pageIndex: this.pageIndex(),
      pageSize: this.pageSize(),
      sort: 'deleted_at_desc',
    });
    this.items.set(page.items);
    this.total.set(page.total);
    this.rows.set(page.items.map((item) => ({
      label: item.label,
      deletedAt: item.deletedAt,
    })));
    this.errorMessage.set('');
  }

  async setPage(pageIndex: number, pageSize: number): Promise<void> {
    this.pageIndex.set(pageIndex);
    this.pageSize.set(pageSize);
    await this.load();
  }

  async restore(id: string): Promise<void> {
    try {
      await this.adapter.restore(this.resource, id);
      this.toast.push('Restored from trash', 'success');
      await this.load();
    } catch (error) {
      if (this.requiresCascade(error) && this.adapter.restoreWithCascade) {
        await this.adapter.restoreWithCascade(this.resource, id);
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
    if (!id || !this.adapter.hardDelete) {
      return;
    }
    await this.adapter.hardDelete(this.resource, id);
    this.toast.push('Archived row removed permanently', 'warning');
    await this.load();
  }

  mayHardDelete(item: StynxTrashItem): boolean {
    return Boolean(item.canHardDelete) && this.session.hasAllPermissions([this.hardDeletePermission]);
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
