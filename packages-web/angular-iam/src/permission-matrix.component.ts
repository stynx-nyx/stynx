import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder } from '@angular/forms';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-web/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
  StynxToastService,
} from '@stynx-web/angular-ui';
import { IamApiService } from './iam-api.service';
import type { StynxPermission } from './types';

interface PermissionGroup {
  resource: string;
  permissions: StynxPermission[];
}

const DEFAULT_IAM_PERMISSIONS: StynxPermission[] = [
  { key: 'iam:users:read', resource: 'users', action: 'read' },
  { key: 'iam:users:write', resource: 'users', action: 'write' },
  { key: 'iam:roles:read', resource: 'roles', action: 'read' },
  { key: 'iam:roles:write', resource: 'roles', action: 'write' },
  { key: 'iam:groups:read', resource: 'groups', action: 'read' },
  { key: 'iam:groups:write', resource: 'groups', action: 'write' },
];

function normalizePermission(permission: StynxPermission): StynxPermission {
  const [domain, resource, action] = permission.key.split(':');
  return {
    ...permission,
    resource: permission.resource || resource || domain || 'custom',
    action: permission.action || action || permission.key,
  };
}

function includesSearch(permission: StynxPermission, search: string): boolean {
  const value = search.trim().toLowerCase();
  if (!value) {
    return true;
  }
  return [
    permission.key,
    permission.resource,
    permission.action,
    permission.description ?? '',
  ].some((part) => part?.toLowerCase().includes(value));
}

@Component({
  selector: 'stynx-permission-matrix',
  standalone: true,
  imports: [
    EmptyStateComponent,
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-iam-permission-matrix">
      <header class="matrix-header">
        <div>
          <h2>{{ 'iam.roles.permissions.title' | stynxTranslate }}</h2>
          <p>{{ 'iam.roles.permissions.description' | stynxTranslate }}</p>
        </div>
        <button type="button" (click)="save()" [disabled]="saving() || !currentRoleId()">
          <stynx-icon name="save" aria-hidden="true"></stynx-icon>
          {{ 'iam.roles.permissions.save' | stynxTranslate }}
        </button>
      </header>

      <form class="toolbar" [formGroup]="filterForm" (ngSubmit)="applySearch()">
        <label>
          <span>{{ 'iam.roles.permissions.search.label' | stynxTranslate }}</span>
          <input
            formControlName="q"
            type="search"
            [placeholder]="'iam.roles.permissions.search.placeholder' | stynxTranslate"
          />
        </label>
        <button type="submit" class="secondary">
          <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
          {{ 'iam.roles.permissions.search.submit' | stynxTranslate }}
        </button>
        <button type="button" class="secondary" (click)="clearSearch()">
          {{ 'iam.roles.permissions.search.clear' | stynxTranslate }}
        </button>
      </form>

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.roles.permissions.errorTitle' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.roles.permissions.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      } @else if (permissionCount() > 1000) {
        <stynx-banner
          tone="warning"
          [title]="'iam.roles.permissions.tooLarge.title' | stynxTranslate"
          [message]="'iam.roles.permissions.tooLarge.description' | stynxTranslate"
        ></stynx-banner>
      } @else if (groups().length === 0) {
        <stynx-empty-state
          [title]="'iam.roles.permissions.empty.title' | stynxTranslate"
          [description]="'iam.roles.permissions.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <div class="matrix-summary">
          <span>
            {{ selectedCount() }} / {{ permissionCount() }}
            {{ 'iam.roles.permissions.selected' | stynxTranslate }}
          </span>
          <span>{{ dirtyKey() | stynxTranslate }}</span>
        </div>

        <div class="resource-groups">
          @for (group of groups(); track group.resource) {
            <section class="resource-group">
              <header>
                <div>
                  <h3>{{ group.resource }}</h3>
                  <p>
                    {{ selectedInGroup(group) }} / {{ group.permissions.length }}
                    {{ 'iam.roles.permissions.selected' | stynxTranslate }}
                  </p>
                </div>
                <div class="group-actions">
                  <button type="button" class="secondary" (click)="selectResource(group)">
                    {{ 'iam.roles.permissions.actions.selectResource' | stynxTranslate }}
                  </button>
                  <button type="button" class="secondary" (click)="clearResource(group)">
                    {{ 'iam.roles.permissions.actions.clearResource' | stynxTranslate }}
                  </button>
                </div>
              </header>

              <div class="permission-grid">
                @for (permission of group.permissions; track permission.key) {
                  <label class="permission-cell">
                    <input
                      type="checkbox"
                      [checked]="permissionSelected(permission.key)"
                      (change)="togglePermission(permission.key)"
                    />
                    <span>
                      <strong>{{ permission.action }}</strong>
                      <code>{{ permission.key }}</code>
                      @if (permission.description) {
                        <small>{{ permission.description }}</small>
                      }
                    </span>
                  </label>
                }
              </div>
            </section>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .stynx-iam-permission-matrix,
    .resource-groups,
    .resource-group,
    .permission-grid {
      display: grid;
      gap: 1rem;
    }

    .matrix-header,
    .toolbar,
    .matrix-summary,
    .resource-group header,
    .group-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 0.75rem;
    }

    .matrix-header,
    .matrix-summary,
    .resource-group header {
      justify-content: space-between;
    }

    h2,
    h3,
    p {
      margin: 0;
    }

    h2 {
      font-size: 1.15rem;
    }

    h3 {
      font-size: 1rem;
    }

    p,
    small,
    .matrix-summary {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    label {
      display: grid;
      gap: 0.35rem;
      font-weight: 650;
    }

    .toolbar {
      justify-content: flex-start;
    }

    .toolbar label {
      min-width: min(24rem, 100%);
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

    input[type='checkbox'] {
      width: auto;
    }

    .resource-group {
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 1rem;
      background: var(--mat-sys-surface, #ffffff);
    }

    .permission-grid {
      grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    }

    .permission-cell {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      border: 1px solid var(--mat-sys-outline-variant, #e2e8f0);
      border-radius: 8px;
      padding: 0.75rem;
      font-weight: 500;
    }

    .permission-cell span {
      display: grid;
      gap: 0.25rem;
      min-width: 0;
    }

    code {
      overflow-wrap: anywhere;
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

    button.secondary {
      border-color: var(--mat-sys-outline-variant, #cbd5e1);
      background: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-on-surface, #0f172a);
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
export class StynxPermissionMatrixComponent {
  private readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly permissionsChanged = new EventEmitter<string[]>();

  readonly currentRoleId = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  readonly assignedKeys = signal<ReadonlySet<string>>(new Set());
  readonly originalKeys = signal<ReadonlySet<string>>(new Set());
  readonly rolePermissions = signal<StynxPermission[]>([]);

  readonly filterForm = this.formBuilder.group({
    q: [''],
  });

  readonly allPermissions = computed(() => {
    const byKey = new Map<string, StynxPermission>();
    for (const permission of DEFAULT_IAM_PERMISSIONS) {
      byKey.set(permission.key, normalizePermission(permission));
    }
    for (const permission of this.rolePermissions()) {
      byKey.set(permission.key, normalizePermission(permission));
    }
    for (const key of this.assignedKeys()) {
      if (!byKey.has(key)) {
        byKey.set(key, normalizePermission({ key }));
      }
    }
    return [...byKey.values()].sort((left, right) => left.key.localeCompare(right.key));
  });

  readonly filteredPermissions = computed(() => this.allPermissions().filter((permission) => includesSearch(permission, this.search())));

  readonly groups = computed<PermissionGroup[]>(() => {
    const byResource = new Map<string, StynxPermission[]>();
    for (const permission of this.filteredPermissions()) {
      const resource = permission.resource || 'custom';
      const permissions = byResource.get(resource) ?? [];
      permissions.push(permission);
      byResource.set(resource, permissions);
    }
    return [...byResource.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([resource, permissions]) => ({ resource, permissions }));
  });

  readonly permissionCount = computed(() => this.filteredPermissions().length);
  readonly selectedCount = computed(() => this.filteredPermissions().filter((permission) => this.assignedKeys().has(permission.key)).length);
  readonly dirty = computed(() => !this.sameSet(this.assignedKeys(), this.originalKeys()));

  @Input()
  set roleId(value: string | null | undefined) {
    this.currentRoleId.set(value ?? '');
    if (value) {
      this.load(value);
    } else {
      this.assignedKeys.set(new Set());
      this.originalKeys.set(new Set());
      this.rolePermissions.set([]);
    }
  }

  protected applySearch(): void {
    this.search.set(this.filterForm.controls.q.value.trim());
  }

  protected clearSearch(): void {
    this.filterForm.reset({ q: '' });
    this.search.set('');
  }

  protected dirtyKey(): string {
    return this.dirty() ? 'iam.roles.permissions.unsaved' : 'iam.roles.permissions.saved';
  }

  protected permissionSelected(key: string): boolean {
    return this.assignedKeys().has(key);
  }

  protected selectedInGroup(group: PermissionGroup): number {
    return group.permissions.filter((permission) => this.permissionSelected(permission.key)).length;
  }

  protected togglePermission(key: string): void {
    this.assignedKeys.update((current) => this.toggleSet(current, key));
  }

  protected selectResource(group: PermissionGroup): void {
    this.assignedKeys.update((current) => {
      const next = new Set(current);
      for (const permission of group.permissions) {
        next.add(permission.key);
      }
      return next;
    });
  }

  protected clearResource(group: PermissionGroup): void {
    this.assignedKeys.update((current) => {
      const next = new Set(current);
      for (const permission of group.permissions) {
        next.delete(permission.key);
      }
      return next;
    });
  }

  protected save(): void {
    const id = this.currentRoleId();
    if (!id) {
      return;
    }

    const permissionKeys = [...this.assignedKeys()].sort();
    this.saving.set(true);
    this.error.set('');
    this.api.setRolePermissions(id, permissionKeys).subscribe({
      next: () => {
        this.saving.set(false);
        this.originalKeys.set(new Set(permissionKeys));
        this.permissionsChanged.emit(permissionKeys);
        this.toast?.push(this.translate('iam.roles.permissions.savedToast'), 'success');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errorMessage(error, 'iam.roles.permissions.saveFailed'));
      },
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listRolePermissions(id).subscribe({
      next: (permissions) => {
        const normalized = permissions.map((permission) => normalizePermission(permission));
        const keys = new Set(normalized.map((permission) => permission.key));
        this.loading.set(false);
        this.rolePermissions.set(normalized);
        this.assignedKeys.set(keys);
        this.originalKeys.set(new Set(keys));
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.roles.permissions.loadFailed'));
      },
    });
  }

  private toggleSet(current: ReadonlySet<string>, key: string): ReadonlySet<string> {
    const next = new Set(current);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    return next;
  }

  private sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    if (left.size !== right.size) {
      return false;
    }
    for (const value of left) {
      if (!right.has(value)) {
        return false;
      }
    }
    return true;
  }

  private errorMessage(error: unknown, fallbackKey: string): string {
    return error instanceof Error ? error.message : this.translate(fallbackKey);
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
