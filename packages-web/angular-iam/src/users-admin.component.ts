import { ChangeDetectionStrategy, Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-web/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
  StynxPaginationComponent,
  StynxToastService,
} from '@stynx-web/angular-ui';
import type { StynxPageChange } from '@stynx-web/angular-ui';
import { IamApiService } from './iam-api.service';
import { StynxUserCreateDialogComponent } from './user-create-dialog.component';
import type { StynxCreateUserRequest, StynxUser } from './types';

function userDisplayName(user: StynxUser): string {
  return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

@Component({
  selector: 'stynx-users-admin',
  standalone: true,
  imports: [
    EmptyStateComponent,
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxPaginationComponent,
    StynxTranslatePipe,
    StynxUserCreateDialogComponent,
  ],
  template: `
    <section class="stynx-iam-users">
      <header class="page-header">
        <div>
          <h1>{{ 'iam.users.title' | stynxTranslate }}</h1>
          <p>{{ 'iam.users.description' | stynxTranslate }}</p>
        </div>
        <button type="button" (click)="openCreateDialog()">
          <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
          {{ 'iam.users.actions.create' | stynxTranslate }}
        </button>
      </header>

      <form class="toolbar" [formGroup]="searchForm" (ngSubmit)="search()">
        <label>
          <span>{{ 'iam.users.search.label' | stynxTranslate }}</span>
          <input formControlName="q" type="search" [placeholder]="'iam.users.search.placeholder' | stynxTranslate" />
        </label>
        <button type="submit">
          <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
          {{ 'iam.users.actions.search' | stynxTranslate }}
        </button>
        <button type="button" class="secondary" (click)="clearSearch()">
          {{ 'iam.users.actions.clear' | stynxTranslate }}
        </button>
      </form>

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.users.error.title' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.users.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      } @else if (api.users().length === 0) {
        <stynx-empty-state
          [title]="'iam.users.empty.title' | stynxTranslate"
          [description]="'iam.users.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ 'iam.users.table.name' | stynxTranslate }}</th>
                <th>{{ 'iam.users.table.email' | stynxTranslate }}</th>
                <th>{{ 'iam.users.table.status' | stynxTranslate }}</th>
                <th>{{ 'iam.users.table.lastLogin' | stynxTranslate }}</th>
                <th>{{ 'iam.common.actions' | stynxTranslate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (user of api.users(); track user.id) {
                <tr
                  tabindex="0"
                  (click)="openDetail(user)"
                  (keydown.enter)="openDetail(user)"
                  (keydown.space)="openDetail(user)"
                >
                  <td>
                    <strong>{{ displayName(user) }}</strong>
                    @if (user.tenantId) {
                      <small>{{ user.tenantId }}</small>
                    }
                  </td>
                  <td>{{ user.email }}</td>
                  <td>
                    <span class="status-pill" [attr.data-status]="user.status || 'active'">
                      {{ statusKey(user) | stynxTranslate }}
                    </span>
                  </td>
                  <td>{{ user.lastLoginAt || ('iam.common.never' | stynxTranslate) }}</td>
                  <td>
                    <button type="button" class="link-button" (click)="openDetail(user); $event.stopPropagation()">
                      {{ 'iam.users.actions.view' | stynxTranslate }}
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <stynx-pagination
          [totalItems]="total()"
          [page]="pageIndex()"
          [pageSizeInput]="pageSize()"
          (pageChange)="pageChanged($event)"
        ></stynx-pagination>
      }

      <stynx-user-create-dialog
        [open]="createOpen()"
        [saving]="createSaving()"
        [error]="createError()"
        (create)="createUser($event)"
        (dismissed)="closeCreateDialog()"
      ></stynx-user-create-dialog>

    </section>
  `,
  styles: [`
    .stynx-iam-users {
      display: grid;
      gap: 1rem;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .page-header,
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      justify-content: space-between;
      gap: 1rem;
    }

    h1,
    p {
      margin: 0;
    }

    h1 {
      font-size: 1.5rem;
    }

    p,
    small {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    .toolbar {
      justify-content: flex-start;
    }

    label {
      display: grid;
      gap: 0.35rem;
      min-width: min(26rem, 100%);
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

    .table-scroll {
      overflow-x: auto;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
    }

    table {
      width: 100%;
      min-width: 46rem;
      border-collapse: collapse;
      background: var(--mat-sys-surface, #ffffff);
    }

    th,
    td {
      padding: 0.8rem 1rem;
      border-bottom: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
      text-align: left;
      vertical-align: middle;
    }

    th {
      color: var(--mat-sys-on-surface-variant, #475569);
      font-weight: 700;
    }

    tbody tr {
      cursor: pointer;
    }

    tbody tr:focus-visible,
    tbody tr:hover {
      outline: 2px solid var(--mat-sys-primary, #2563eb);
      outline-offset: -2px;
      background: var(--mat-sys-surface-container-low, #f8fafc);
    }

    td:first-child {
      display: grid;
      gap: 0.2rem;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 0.2rem 0.55rem;
      background: var(--mat-sys-surface-container-high, #e2e8f0);
      color: var(--mat-sys-on-surface, #0f172a);
      font-size: 0.85rem;
      font-weight: 700;
    }

    .status-pill[data-status='active'] {
      background: color-mix(in srgb, var(--mat-sys-primary, #16a34a) 15%, white);
    }

    .status-pill[data-status='disabled'],
    .status-pill[data-status='archived'] {
      background: color-mix(in srgb, var(--mat-sys-error, #dc2626) 12%, white);
    }

    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      border: 1px solid var(--mat-sys-primary, #2563eb);
      border-radius: 8px;
      padding: 0.6rem 0.85rem;
      background: var(--mat-sys-primary, #2563eb);
      color: var(--mat-sys-on-primary, #ffffff);
      font: inherit;
      font-weight: 700;
    }

    button.secondary,
    button.link-button {
      border-color: var(--mat-sys-outline-variant, #cbd5e1);
      background: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-on-surface, #0f172a);
    }

    button.link-button {
      padding: 0.35rem 0.6rem;
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxUsersAdminComponent {
  protected readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly userSelected = new EventEmitter<StynxUser>();

  readonly loading = signal(false);
  readonly error = signal('');
  readonly total = signal(0);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly createOpen = signal(false);
  readonly createSaving = signal(false);
  readonly createError = signal('');

  readonly searchForm = this.formBuilder.group({
    q: [''],
  });

  constructor() {
    this.load();
  }

  protected displayName(user: StynxUser): string {
    return userDisplayName(user);
  }

  protected statusKey(user: StynxUser): string {
    return `iam.users.status.${user.status || 'active'}`;
  }

  protected search(): void {
    this.pageIndex.set(0);
    this.load();
  }

  protected clearSearch(): void {
    this.searchForm.reset({ q: '' });
    this.pageIndex.set(0);
    this.load();
  }

  protected pageChanged(event: StynxPageChange): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  protected openCreateDialog(): void {
    this.createError.set('');
    this.createOpen.set(true);
  }

  protected closeCreateDialog(): void {
    if (!this.createSaving()) {
      this.createOpen.set(false);
      this.createError.set('');
    }
  }

  protected createUser(body: StynxCreateUserRequest): void {
    this.createSaving.set(true);
    this.createError.set('');
    this.api.createUser(body).subscribe({
      next: () => {
        this.createSaving.set(false);
        this.createOpen.set(false);
        this.toast?.push(this.translate('iam.users.create.created'), 'success');
        this.load();
      },
      error: (error: unknown) => {
        this.createSaving.set(false);
        this.createError.set(this.errorMessage(error, 'iam.users.create.failed'));
      },
    });
  }

  protected openDetail(user: StynxUser): void {
    this.userSelected.emit(user);
    if (this.router && this.route) {
      void this.router.navigate([user.id], { relativeTo: this.route });
    }
  }

  private load(): void {
    const q = this.searchForm.controls.q.value.trim();
    this.loading.set(true);
    this.error.set('');
    this.api.listUsers({
      ...(q ? { q } : {}),
      page: this.pageIndex() + 1,
      pageSize: this.pageSize(),
    }).subscribe({
      next: (page) => {
        this.loading.set(false);
        this.total.set(page.meta.total);
        this.pageIndex.set(Math.max(0, page.meta.page - 1));
        this.pageSize.set(page.meta.pageSize);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.users.error.loadFailed'));
      },
    });
  }

  private errorMessage(error: unknown, fallbackKey: string): string {
    return error instanceof Error ? error.message : this.translate(fallbackKey);
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
