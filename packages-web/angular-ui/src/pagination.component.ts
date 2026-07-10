import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, signal } from '@angular/core';
import { StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { StynxIconComponent } from './icon/icon.component';

export interface StynxPageChange {
  pageIndex: number;
  pageSize: number;
}

@Component({
  selector: 'stynx-pagination',
  standalone: true,
  imports: [StynxIconComponent, StynxTranslatePipe],
  template: `
    <nav class="stynx-pagination">
      <button type="button" (click)="previous()" [disabled]="pageIndex() <= 0">
        <stynx-icon name="chevron-left" aria-hidden="true"></stynx-icon>
        {{ 'ui.pagination.previous' | stynxTranslate }}
      </button>
      <span>{{ 'ui.pagination.pageStatus' | stynxTranslate: { page: pageIndex() + 1, count: pageCount() } }}</span>
      <button type="button" (click)="next()" [disabled]="pageIndex() + 1 >= pageCount()">
        {{ 'ui.pagination.next' | stynxTranslate }}
        <stynx-icon name="chevron-right" aria-hidden="true"></stynx-icon>
      </button>
    </nav>
  `,
  styles: [`
    .stynx-pagination {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      justify-content: flex-end;
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    button {
      border-radius: 999px;
      border: 1px solid var(--mat-sys-outline-variant, #cbd5e1);
      background: white;
      padding: 0.4rem 0.8rem;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }

    stynx-icon {
      --stynx-icon-size: 0.95rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxPaginationComponent {
  private readonly pageIndexState = signal(0);
  private readonly pageSizeState = signal(10);
  private readonly totalState = signal(0);

  readonly pageIndex = computed(() => this.pageIndexState());
  readonly pageSize = computed(() => this.pageSizeState());
  readonly total = computed(() => this.totalState());
  readonly pageCount = computed(() => {
    const total = this.totalState();
    const pageSize = this.pageSizeState();
    return Math.max(1, Math.ceil(total / pageSize));
  });

  @Output() readonly pageChange = new EventEmitter<StynxPageChange>();

  @Input()
  set totalItems(value: number) {
    this.totalState.set(Math.max(0, value));
  }

  @Input()
  set page(value: number) {
    this.pageIndexState.set(Math.max(0, value));
  }

  @Input()
  set pageSizeInput(value: number) {
    this.pageSizeState.set(Math.max(1, value));
  }

  previous(): void {
    this.update(this.pageIndexState() - 1);
  }

  next(): void {
    this.update(this.pageIndexState() + 1);
  }

  private update(nextPage: number): void {
    const clamped = Math.min(Math.max(0, nextPage), this.pageCount() - 1);
    this.pageIndexState.set(clamped);
    this.pageChange.emit({
      pageIndex: clamped,
      pageSize: this.pageSizeState(),
    });
  }
}
