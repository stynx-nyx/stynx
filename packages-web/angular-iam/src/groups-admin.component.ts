import { ChangeDetectionStrategy, Component, EventEmitter, Output, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-web/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
  StynxToastService,
} from '@stynx-web/angular-ui';
import { StynxGroupCreateDialogComponent } from './group-create-dialog.component';
import { IamApiService } from './iam-api.service';
import type { StynxCreateGroupRequest, StynxGroup } from './types';

function includesGroupSearch(group: StynxGroup, search: string): boolean {
  const value = search.trim().toLowerCase();
  if (!value) {
    return true;
  }
  return [group.key, group.name, group.description ?? ''].some((part) => part.toLowerCase().includes(value));
}

@Component({
  selector: 'stynx-groups-admin',
  standalone: true,
  imports: [
    EmptyStateComponent,
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxGroupCreateDialogComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-iam-groups">
      <header class="page-header">
        <div>
          <h1>{{ 'iam.groups.title' | stynxTranslate }}</h1>
          <p>{{ 'iam.groups.description' | stynxTranslate }}</p>
        </div>
        <button type="button" (click)="openCreateDialog()">
          <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
          {{ 'iam.groups.actions.create' | stynxTranslate }}
        </button>
      </header>

      <form class="toolbar" [formGroup]="searchForm" (ngSubmit)="search()">
        <label>
          <span>{{ 'iam.groups.search.label' | stynxTranslate }}</span>
          <input formControlName="q" type="search" [placeholder]="'iam.groups.search.placeholder' | stynxTranslate" />
        </label>
        <button type="submit" class="secondary">
          <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
          {{ 'iam.groups.actions.search' | stynxTranslate }}
        </button>
        <button type="button" class="secondary" (click)="clearSearch()">
          {{ 'iam.groups.actions.clear' | stynxTranslate }}
        </button>
      </form>

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.groups.error.title' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.groups.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      } @else if (filteredGroups().length === 0) {
        <stynx-empty-state
          [title]="'iam.groups.empty.title' | stynxTranslate"
          [description]="'iam.groups.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ 'iam.groups.table.name' | stynxTranslate }}</th>
                <th>{{ 'iam.groups.table.key' | stynxTranslate }}</th>
                <th>{{ 'iam.groups.table.roles' | stynxTranslate }}</th>
                <th>{{ 'iam.groups.table.members' | stynxTranslate }}</th>
                <th>{{ 'iam.common.actions' | stynxTranslate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (group of filteredGroups(); track group.id) {
                <tr
                  tabindex="0"
                  (click)="openDetail(group)"
                  (keydown.enter)="openDetail(group)"
                  (keydown.space)="openDetail(group)"
                >
                  <td>
                    <strong>{{ group.name }}</strong>
                    @if (group.description) {
                      <small>{{ group.description }}</small>
                    }
                  </td>
                  <td><code>{{ group.key }}</code></td>
                  <td>{{ group.rolesCount ?? 0 }}</td>
                  <td>{{ group.membersCount ?? 0 }}</td>
                  <td>
                    <div class="row-actions">
                      <button type="button" class="link-button" (click)="openDetail(group); $event.stopPropagation()">
                        {{ 'iam.groups.actions.view' | stynxTranslate }}
                      </button>
                      <button
                        type="button"
                        class="link-button danger-link"
                        [disabled]="actionSaving()"
                        (click)="deleteGroup(group); $event.stopPropagation()"
                      >
                        {{ 'iam.groups.actions.delete' | stynxTranslate }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <stynx-group-create-dialog
        [open]="createOpen()"
        [saving]="createSaving()"
        [error]="createError()"
        (create)="createGroup($event)"
        (dismissed)="closeCreateDialog()"
      ></stynx-group-create-dialog>
    </section>
  `,
  styles: [`
    .stynx-iam-groups {
      display: grid;
      gap: 1rem;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .page-header,
    .toolbar,
    .row-actions {
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
      min-width: 48rem;
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

    code {
      color: var(--mat-sys-primary, #2563eb);
      font: 0.85rem ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
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

    button.danger-link {
      color: var(--mat-sys-error, #dc2626);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxGroupsAdminComponent {
  protected readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly groupSelected = new EventEmitter<StynxGroup>();

  readonly loading = signal(false);
  readonly error = signal('');
  readonly searchText = signal('');
  readonly createOpen = signal(false);
  readonly createSaving = signal(false);
  readonly createError = signal('');
  readonly actionSaving = signal(false);

  readonly searchForm = this.formBuilder.group({
    q: [''],
  });

  readonly filteredGroups = computed(() => this.api.groups().filter((group) => includesGroupSearch(group, this.searchText())));

  constructor() {
    this.load();
  }

  protected search(): void {
    this.searchText.set(this.searchForm.controls.q.value.trim());
  }

  protected clearSearch(): void {
    this.searchForm.reset({ q: '' });
    this.searchText.set('');
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

  protected createGroup(body: StynxCreateGroupRequest): void {
    this.createSaving.set(true);
    this.createError.set('');
    this.api.createGroup(body).subscribe({
      next: () => {
        this.createSaving.set(false);
        this.createOpen.set(false);
        this.toast?.push(this.translate('iam.groups.create.created'), 'success');
        this.load();
      },
      error: (error: unknown) => {
        this.createSaving.set(false);
        this.createError.set(this.errorMessage(error, 'iam.groups.create.failed'));
      },
    });
  }

  protected deleteGroup(group: StynxGroup): void {
    this.actionSaving.set(true);
    this.error.set('');
    this.api.deleteGroup(group.id).subscribe({
      next: () => {
        this.actionSaving.set(false);
        this.toast?.push(this.translate('iam.groups.delete.deleted'), 'success');
      },
      error: (error: unknown) => {
        this.actionSaving.set(false);
        this.error.set(this.errorMessage(error, 'iam.groups.delete.failed'));
      },
    });
  }

  protected openDetail(group: StynxGroup): void {
    this.groupSelected.emit(group);
    if (this.router && this.route) {
      void this.router.navigate([group.id], { relativeTo: this.route });
    }
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listGroups().subscribe({
      next: () => {
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.groups.error.loadFailed'));
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
