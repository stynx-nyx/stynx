import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-web/angular-i18n';
import { EmptyStateComponent, StynxBannerComponent, StynxLoadingSpinnerComponent, StynxToastService } from '@stynx-web/angular-ui';
import { forkJoin } from 'rxjs';
import { IamApiService } from './iam-api.service';
import type { StynxRole } from './types';

function isAssigned(id: string, assignedIds: ReadonlySet<string>): boolean {
  return assignedIds.has(id);
}

@Component({
  selector: 'stynx-group-roles-editor',
  standalone: true,
  imports: [EmptyStateComponent, StynxBannerComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="stynx-group-roles-editor">
      <header>
        <div>
          <h2>{{ 'iam.groups.roles.title' | stynxTranslate }}</h2>
          <p>{{ 'iam.groups.roles.description' | stynxTranslate }}</p>
        </div>
        <button type="button" [disabled]="saving() || !currentGroupId()" (click)="save()">
          {{ 'iam.groups.roles.save' | stynxTranslate }}
        </button>
      </header>

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.groups.roles.errorTitle' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.groups.roles.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      } @else if (roles().length === 0) {
        <stynx-empty-state
          [title]="'iam.groups.roles.empty.title' | stynxTranslate"
          [description]="'iam.groups.roles.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <div class="selection-list">
          @for (role of roles(); track role.id) {
            <label class="selection-row">
              <input
                type="checkbox"
                [checked]="hasRole(role.id)"
                [disabled]="saving()"
                (change)="toggleRole(role.id)"
              />
              <span>
                <strong>{{ role.name }}</strong>
                <small><code>{{ role.key }}</code></small>
                @if (role.description) {
                  <small>{{ role.description }}</small>
                }
              </span>
            </label>
          }
        </div>
      }

      @if (saving()) {
        <stynx-loading-spinner
          [size]="1"
          [label]="'iam.groups.roles.saving' | stynxTranslate"
        ></stynx-loading-spinner>
      }
    </section>
  `,
  styles: [`
    .stynx-group-roles-editor {
      display: grid;
      gap: 1rem;
    }

    header,
    .selection-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    header {
      flex-wrap: wrap;
      justify-content: space-between;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 1.15rem;
    }

    p,
    small {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    .selection-list {
      display: grid;
      gap: 0.5rem;
    }

    .selection-row {
      align-items: flex-start;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.75rem;
      background: var(--mat-sys-surface, #ffffff);
    }

    .selection-row span {
      display: grid;
      gap: 0.2rem;
    }

    code {
      color: var(--mat-sys-primary, #2563eb);
      font: 0.85rem ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    button {
      border: 1px solid var(--mat-sys-primary, #2563eb);
      border-radius: 8px;
      padding: 0.6rem 0.85rem;
      background: var(--mat-sys-primary, #2563eb);
      color: var(--mat-sys-on-primary, #ffffff);
      font: inherit;
      font-weight: 700;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxGroupRolesEditorComponent {
  private readonly api = inject(IamApiService);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly rolesChanged = new EventEmitter<string[]>();

  readonly currentGroupId = signal('');
  readonly roles = signal<StynxRole[]>([]);
  readonly assignedRoleIds = signal<ReadonlySet<string>>(new Set());
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly selectedRoleIds = computed(() => [...this.assignedRoleIds()]);

  @Input()
  set groupId(value: string | null | undefined) {
    const id = value ?? '';
    this.currentGroupId.set(id);
    if (id) {
      this.load(id);
    } else {
      this.roles.set([]);
      this.assignedRoleIds.set(new Set());
    }
  }

  protected hasRole(id: string): boolean {
    return isAssigned(id, this.assignedRoleIds());
  }

  protected toggleRole(id: string): void {
    this.assignedRoleIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected save(): void {
    const id = this.currentGroupId();
    if (!id) {
      return;
    }
    const roleIds = this.selectedRoleIds();
    this.saving.set(true);
    this.error.set('');
    this.api.setGroupRoles(id, roleIds).subscribe({
      next: () => {
        this.saving.set(false);
        this.rolesChanged.emit(roleIds);
        this.toast?.push(this.translate('iam.groups.roles.saved'), 'success');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errorMessage(error, 'iam.groups.roles.saveFailed'));
      },
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      roles: this.api.listRoles(),
      assigned: this.api.listGroupRoles(id),
    }).subscribe({
      next: ({ roles, assigned }) => {
        this.loading.set(false);
        this.roles.set(roles);
        this.assignedRoleIds.set(new Set(assigned.map((role) => role.id)));
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.groups.roles.loadFailed'));
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
