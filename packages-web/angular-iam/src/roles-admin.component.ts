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
import { IamApiService } from './iam-api.service';
import { StynxRoleCreateDialogComponent } from './role-create-dialog.component';
import type { StynxCloneRoleRequest, StynxCreateRoleRequest, StynxRole } from './types';

function includesRoleSearch(role: StynxRole, search: string): boolean {
  const value = search.trim().toLowerCase();
  if (!value) {
    return true;
  }
  return [role.key, role.name, role.description ?? ''].some((part) => part.toLowerCase().includes(value));
}

@Component({
  selector: 'stynx-roles-admin',
  standalone: true,
  imports: [
    EmptyStateComponent,
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxRoleCreateDialogComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-iam-roles">
      <header class="page-header">
        <div>
          <h1>{{ 'iam.roles.title' | stynxTranslate }}</h1>
          <p>{{ 'iam.roles.description' | stynxTranslate }}</p>
        </div>
        <button type="button" (click)="openCreateDialog()">
          <stynx-icon name="plus" aria-hidden="true"></stynx-icon>
          {{ 'iam.roles.actions.create' | stynxTranslate }}
        </button>
      </header>

      <form class="toolbar" [formGroup]="searchForm" (ngSubmit)="search()">
        <label>
          <span>{{ 'iam.roles.search.label' | stynxTranslate }}</span>
          <input formControlName="q" type="search" [placeholder]="'iam.roles.search.placeholder' | stynxTranslate" />
        </label>
        <button type="submit" class="secondary">
          <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
          {{ 'iam.roles.actions.search' | stynxTranslate }}
        </button>
        <button type="button" class="secondary" (click)="clearSearch()">
          {{ 'iam.roles.actions.clear' | stynxTranslate }}
        </button>
      </form>

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.roles.error.title' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.roles.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      } @else if (filteredRoles().length === 0) {
        <stynx-empty-state
          [title]="'iam.roles.empty.title' | stynxTranslate"
          [description]="'iam.roles.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{{ 'iam.roles.table.name' | stynxTranslate }}</th>
                <th>{{ 'iam.roles.table.key' | stynxTranslate }}</th>
                <th>{{ 'iam.roles.table.permissions' | stynxTranslate }}</th>
                <th>{{ 'iam.roles.table.members' | stynxTranslate }}</th>
                <th>{{ 'iam.common.actions' | stynxTranslate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (role of filteredRoles(); track role.id) {
                <tr
                  tabindex="0"
                  (click)="openDetail(role)"
                  (keydown.enter)="openDetail(role)"
                  (keydown.space)="openDetail(role)"
                >
                  <td>
                    <strong>{{ role.name }}</strong>
                    @if (role.description) {
                      <small>{{ role.description }}</small>
                    }
                  </td>
                  <td><code>{{ role.key }}</code></td>
                  <td>{{ role.permissionsCount ?? 0 }}</td>
                  <td>{{ role.membersCount ?? 0 }}</td>
                  <td>
                    <div class="row-actions">
                      <button type="button" class="link-button" (click)="openDetail(role); $event.stopPropagation()">
                        {{ 'iam.roles.actions.view' | stynxTranslate }}
                      </button>
                      <button type="button" class="link-button" (click)="openCloneDialog(role); $event.stopPropagation()">
                        {{ 'iam.roles.actions.clone' | stynxTranslate }}
                      </button>
                      <button
                        type="button"
                        class="link-button danger-link"
                        [disabled]="role.system || actionSaving()"
                        (click)="deleteRole(role); $event.stopPropagation()"
                      >
                        {{ 'iam.roles.actions.delete' | stynxTranslate }}
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }

      <stynx-role-create-dialog
        [open]="createOpen()"
        [saving]="dialogSaving()"
        [error]="dialogError()"
        [sourceRole]="cloneSource()"
        [initialRole]="cloneSource()"
        (create)="createRole($event)"
        (clone)="cloneRole($event)"
        (dismissed)="closeDialog()"
      ></stynx-role-create-dialog>
    </section>
  `,
  styles: [`
    .stynx-iam-roles {
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
export class StynxRolesAdminComponent {
  protected readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly router = inject(Router, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly roleSelected = new EventEmitter<StynxRole>();

  readonly loading = signal(false);
  readonly error = signal('');
  readonly searchText = signal('');
  readonly createOpen = signal(false);
  readonly dialogSaving = signal(false);
  readonly dialogError = signal('');
  readonly actionSaving = signal(false);
  readonly cloneSource = signal<StynxRole | null>(null);

  readonly searchForm = this.formBuilder.group({
    q: [''],
  });

  readonly filteredRoles = computed(() => this.api.roles().filter((role) => includesRoleSearch(role, this.searchText())));

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
    this.dialogError.set('');
    this.cloneSource.set(null);
    this.createOpen.set(true);
  }

  protected openCloneDialog(role: StynxRole): void {
    this.dialogError.set('');
    this.cloneSource.set(role);
    this.createOpen.set(true);
  }

  protected closeDialog(): void {
    if (!this.dialogSaving()) {
      this.createOpen.set(false);
      this.dialogError.set('');
      this.cloneSource.set(null);
    }
  }

  protected createRole(body: StynxCreateRoleRequest): void {
    this.dialogSaving.set(true);
    this.dialogError.set('');
    this.api.createRole(body).subscribe({
      next: () => {
        this.dialogSaving.set(false);
        this.createOpen.set(false);
        this.toast?.push(this.translate('iam.roles.create.created'), 'success');
        this.load();
      },
      error: (error: unknown) => {
        this.dialogSaving.set(false);
        this.dialogError.set(this.errorMessage(error, 'iam.roles.create.failed'));
      },
    });
  }

  protected cloneRole(body: StynxCloneRoleRequest): void {
    const source = this.cloneSource();
    if (!source) {
      return;
    }
    this.dialogSaving.set(true);
    this.dialogError.set('');
    this.api.cloneRole(source.id, body).subscribe({
      next: () => {
        this.dialogSaving.set(false);
        this.createOpen.set(false);
        this.cloneSource.set(null);
        this.toast?.push(this.translate('iam.roles.clone.created'), 'success');
        this.load();
      },
      error: (error: unknown) => {
        this.dialogSaving.set(false);
        this.dialogError.set(this.errorMessage(error, 'iam.roles.clone.failed'));
      },
    });
  }

  protected deleteRole(role: StynxRole): void {
    if (role.system) {
      return;
    }
    this.actionSaving.set(true);
    this.error.set('');
    this.api.deleteRole(role.id).subscribe({
      next: () => {
        this.actionSaving.set(false);
        this.toast?.push(this.translate('iam.roles.delete.deleted'), 'success');
      },
      error: (error: unknown) => {
        this.actionSaving.set(false);
        this.error.set(this.errorMessage(error, 'iam.roles.delete.failed'));
      },
    });
  }

  protected openDetail(role: StynxRole): void {
    this.roleSelected.emit(role);
    if (this.router && this.route) {
      void this.router.navigate([role.id], { relativeTo: this.route });
    }
  }

  private load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listRoles().subscribe({
      next: () => {
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.roles.error.loadFailed'));
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
