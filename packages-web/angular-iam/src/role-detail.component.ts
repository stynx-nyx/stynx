import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
  StynxToastService,
} from '@stynx-nyx/angular-ui';
import { IamApiService } from './iam-api.service';
import { StynxPermissionMatrixComponent } from './permission-matrix.component';
import type { StynxPatchRoleRequest, StynxRole } from './types';

type RoleDetailTab = 'overview' | 'permissions';

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

@Component({
  selector: 'stynx-role-detail',
  standalone: true,
  imports: [
    EmptyStateComponent,
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxPermissionMatrixComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-iam-role-detail">
      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.roles.detail.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      }

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.roles.detail.errorTitle' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (role(); as currentRole) {
        <header class="detail-header">
          <div>
            <h1>{{ currentRole.name }}</h1>
            <p><code>{{ currentRole.key }}</code></p>
          </div>
          <div class="facts">
            <span>
              {{ currentRole.permissionsCount ?? 0 }}
              {{ 'iam.roles.fields.permissionsCount' | stynxTranslate }}
            </span>
            <span>
              {{ currentRole.membersCount ?? 0 }}
              {{ 'iam.roles.fields.membersCount' | stynxTranslate }}
            </span>
          </div>
        </header>

        <nav class="tabs" [attr.aria-label]="'iam.roles.detail.tabsLabel' | stynxTranslate">
          @for (tab of tabs; track tab) {
            <button
              type="button"
              class="tab"
              [attr.aria-pressed]="activeTab() === tab"
              (click)="activeTab.set(tab)"
            >
              {{ tabKey(tab) | stynxTranslate }}
            </button>
          }
        </nav>

        @switch (activeTab()) {
          @case ('overview') {
            <form class="overview" [formGroup]="overviewForm" (ngSubmit)="saveOverview()">
              <div class="field-grid">
                <label>
                  <span>{{ 'iam.roles.fields.key' | stynxTranslate }}</span>
                  <input formControlName="key" autocomplete="off" />
                </label>
                <label>
                  <span>{{ 'iam.roles.fields.name' | stynxTranslate }}</span>
                  <input formControlName="name" autocomplete="off" />
                </label>
              </div>
              <label>
                <span>{{ 'iam.roles.fields.description' | stynxTranslate }}</span>
                <textarea formControlName="description" rows="4"></textarea>
              </label>
              <dl>
                <div>
                  <dt>{{ 'iam.roles.fields.system' | stynxTranslate }}</dt>
                  <dd>{{ systemKey(currentRole) | stynxTranslate }}</dd>
                </div>
                <div>
                  <dt>{{ 'iam.roles.fields.createdAt' | stynxTranslate }}</dt>
                  <dd>{{ currentRole.createdAt || ('iam.common.unknown' | stynxTranslate) }}</dd>
                </div>
                <div>
                  <dt>{{ 'iam.roles.fields.updatedAt' | stynxTranslate }}</dt>
                  <dd>{{ currentRole.updatedAt || ('iam.common.unknown' | stynxTranslate) }}</dd>
                </div>
              </dl>
              <footer>
                @if (saving()) {
                  <stynx-loading-spinner
                    [size]="1"
                    [label]="'iam.roles.detail.saving' | stynxTranslate"
                  ></stynx-loading-spinner>
                }
                <button type="submit" [disabled]="overviewForm.invalid || saving() || currentRole.system">
                  <stynx-icon name="save" aria-hidden="true"></stynx-icon>
                  {{ 'iam.roles.actions.save' | stynxTranslate }}
                </button>
              </footer>
            </form>
          }
          @case ('permissions') {
            <stynx-permission-matrix
              [roleId]="currentRole.id"
              (permissionsChanged)="permissionsChanged.emit($event)"
            ></stynx-permission-matrix>
          }
        }
      } @else if (!loading()) {
        <stynx-empty-state
          [title]="'iam.roles.detail.empty.title' | stynxTranslate"
          [description]="'iam.roles.detail.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      }
    </section>
  `,
  styles: [`
    .stynx-iam-role-detail {
      display: grid;
      gap: 1rem;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .detail-header,
    .facts,
    .tabs,
    footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
    }

    .detail-header {
      justify-content: space-between;
    }

    h1,
    p {
      margin: 0;
    }

    h1 {
      font-size: 1.5rem;
    }

    p,
    dt {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    code {
      color: var(--mat-sys-primary, #2563eb);
      font: 0.85rem ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .facts span {
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 999px;
      padding: 0.25rem 0.65rem;
      color: var(--mat-sys-on-surface-variant, #475569);
      font-weight: 700;
    }

    .tabs {
      border-bottom: 1px solid var(--mat-sys-outline-variant, #d8dee9);
    }

    .tab {
      border-color: transparent;
      border-radius: 8px 8px 0 0;
      background: transparent;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .tab[aria-pressed='true'] {
      border-color: var(--mat-sys-outline-variant, #d8dee9);
      border-bottom-color: var(--mat-sys-surface, #ffffff);
      color: var(--mat-sys-primary, #2563eb);
    }

    .overview {
      display: grid;
      gap: 1rem;
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
    }

    label {
      display: grid;
      gap: 0.35rem;
      font-weight: 650;
    }

    input,
    textarea {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.65rem 0.75rem;
      color: inherit;
      background: var(--mat-sys-surface, #ffffff);
      font: inherit;
    }

    textarea {
      resize: vertical;
    }

    dl {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.75rem;
      margin: 0;
    }

    dt,
    dd {
      margin: 0;
    }

    dd {
      font-weight: 700;
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

    button:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    stynx-icon {
      --stynx-icon-size: 1rem;
    }

    @media (max-width: 44rem) {
      .field-grid,
      dl {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxRoleDetailComponent {
  private readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly roleChanged = new EventEmitter<StynxRole>();
  @Output() readonly permissionsChanged = new EventEmitter<string[]>();

  readonly tabs: RoleDetailTab[] = ['overview', 'permissions'];
  readonly role = signal<StynxRole | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly activeTab = signal<RoleDetailTab>('overview');
  readonly currentRoleId = computed(() => this.role()?.id ?? '');

  readonly overviewForm = this.formBuilder.group({
    key: ['', [Validators.required]],
    name: ['', [Validators.required]],
    description: [''],
  });

  @Input()
  set roleId(value: string | null | undefined) {
    if (value) {
      this.load(value);
    } else {
      this.role.set(null);
    }
  }

  protected tabKey(tab: RoleDetailTab): string {
    return `iam.roles.detail.tabs.${tab}`;
  }

  protected systemKey(role: StynxRole): string {
    return role.system ? 'iam.common.yes' : 'iam.common.no';
  }

  protected saveOverview(): void {
    const id = this.currentRoleId();
    if (!id || this.overviewForm.invalid) {
      this.overviewForm.markAllAsTouched();
      return;
    }

    const value = this.overviewForm.getRawValue();
    const diff: StynxPatchRoleRequest = {
      key: value.key.trim(),
      name: value.name.trim(),
    };
    const description = optionalText(value.description);
    if (description) {
      diff.description = description;
    }

    this.saving.set(true);
    this.error.set('');
    this.api.patchRole(id, diff).subscribe({
      next: (role) => {
        this.saving.set(false);
        this.applyRole(role);
        this.roleChanged.emit(role);
        this.toast?.push(this.translate('iam.roles.detail.saved'), 'success');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errorMessage(error, 'iam.roles.detail.saveFailed'));
      },
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listRoles().subscribe({
      next: (roles) => {
        this.loading.set(false);
        const role = roles.find((candidate) => candidate.id === id) ?? null;
        this.role.set(role);
        if (role) {
          this.applyRole(role);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.roles.detail.loadFailed'));
      },
    });
  }

  private applyRole(role: StynxRole): void {
    this.role.set(role);
    this.overviewForm.reset({
      key: role.key,
      name: role.name,
      description: role.description ?? '',
    });
  }

  private errorMessage(error: unknown, fallbackKey: string): string {
    return error instanceof Error ? error.message : this.translate(fallbackKey);
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
