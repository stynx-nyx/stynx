import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-web/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
} from '@stynx-web/angular-ui';
import { IamApiService } from './iam-api.service';
import type { StynxEffectivePermissions, StynxPermissionGrant } from './types';

interface EffectivePermissionView {
  key: string;
  resource: string;
  action: string;
  description: string;
  grant: StynxPermissionGrant;
}

function permissionPart(key: string, index: number, fallback: string): string {
  return key.split(':')[index] || fallback;
}

function normalizeGrant(grant: StynxPermissionGrant): EffectivePermissionView {
  const key = grant.permission.key;
  return {
    key,
    resource: grant.permission.resource || permissionPart(key, 1, 'custom'),
    action: grant.permission.action || permissionPart(key, 2, key),
    description: grant.permission.description ?? '',
    grant,
  };
}

function includesSearch(permission: EffectivePermissionView, search: string): boolean {
  const value = search.trim().toLowerCase();
  if (!value) {
    return true;
  }

  const searchableParts = [
    permission.key,
    permission.resource,
    permission.action,
    permission.description,
  ];
  for (const source of permission.grant.grantedBy) {
    searchableParts.push(source.type, source.id, source.key ?? '', source.name ?? '');
  }

  return searchableParts.some((part) => part.toLowerCase().includes(value));
}

@Component({
  selector: 'stynx-effective-permissions',
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
    <section class="stynx-iam-effective-permissions">
      <header class="viewer-header">
        <div>
          <h2>{{ 'iam.effectivePermissions.title' | stynxTranslate }}</h2>
          <p>{{ 'iam.effectivePermissions.description' | stynxTranslate }}</p>
        </div>
        <button type="button" class="secondary" (click)="refresh()" [disabled]="loading() || !currentUserId()">
          <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
          {{ 'iam.effectivePermissions.actions.refresh' | stynxTranslate }}
        </button>
      </header>

      <form class="toolbar" [formGroup]="filterForm" (ngSubmit)="applySearch()">
        <label>
          <span>{{ 'iam.effectivePermissions.search.label' | stynxTranslate }}</span>
          <input
            formControlName="q"
            type="search"
            [placeholder]="'iam.effectivePermissions.search.placeholder' | stynxTranslate"
          />
        </label>
        <button type="submit">
          <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
          {{ 'iam.effectivePermissions.search.submit' | stynxTranslate }}
        </button>
        <button type="button" class="secondary" (click)="clearSearch()">
          {{ 'iam.effectivePermissions.search.clear' | stynxTranslate }}
        </button>
      </form>

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.effectivePermissions.errorTitle' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.effectivePermissions.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      } @else if (!currentUserId()) {
        <stynx-empty-state
          [title]="'iam.effectivePermissions.emptyUser.title' | stynxTranslate"
          [description]="'iam.effectivePermissions.emptyUser.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else if (filteredPermissions().length === 0) {
        <stynx-empty-state
          [title]="emptyTitleKey() | stynxTranslate"
          [description]="emptyDescriptionKey() | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <div class="summary" aria-live="polite">
          <span>
            {{ filteredPermissions().length }} / {{ permissions().length }}
            {{ 'iam.effectivePermissions.summary.permissions' | stynxTranslate }}
          </span>
          <span>{{ grantSourceCount() }} {{ 'iam.effectivePermissions.summary.sources' | stynxTranslate }}</span>
        </div>

        <div class="permission-list">
          @for (permission of filteredPermissions(); track permission.key) {
            <article class="permission-row">
              <div class="permission-main">
                <strong>{{ permission.key }}</strong>
                <span>
                  {{ 'iam.effectivePermissions.fields.resource' | stynxTranslate }}:
                  {{ permission.resource }}
                </span>
                <span>
                  {{ 'iam.effectivePermissions.fields.action' | stynxTranslate }}:
                  {{ permission.action }}
                </span>
                <small>
                  {{ permission.description || ('iam.effectivePermissions.noDescription' | stynxTranslate) }}
                </small>
              </div>

              <div class="grant-sources">
                <span>{{ 'iam.effectivePermissions.grantedBy' | stynxTranslate }}</span>
                @for (source of permission.grant.grantedBy; track source.type + ':' + source.id) {
                  <span class="source-chip" [attr.data-source-type]="source.type">
                    {{ sourceTypeKey(source.type) | stynxTranslate }}:
                    {{ source.name || source.key || source.id }}
                  </span>
                }
              </div>
            </article>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .stynx-iam-effective-permissions,
    .permission-list {
      display: grid;
      gap: 1rem;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .viewer-header,
    .toolbar,
    .summary,
    .permission-row,
    .grant-sources {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .viewer-header,
    .summary,
    .permission-row {
      justify-content: space-between;
    }

    .viewer-header,
    .permission-row {
      align-items: start;
    }

    .toolbar,
    .grant-sources {
      align-items: end;
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 1.15rem;
    }

    p,
    small,
    .summary,
    .permission-main span,
    .grant-sources > span:first-child {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    label,
    .permission-main {
      display: grid;
      gap: 0.35rem;
    }

    label {
      min-width: min(24rem, 100%);
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

    .permission-row {
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 1rem;
      background: var(--mat-sys-surface, #ffffff);
    }

    .permission-main {
      min-width: min(28rem, 100%);
    }

    .permission-main strong {
      overflow-wrap: anywhere;
      color: var(--mat-sys-primary, #2563eb);
      font: 0.9rem ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .grant-sources {
      justify-content: flex-end;
      max-width: 32rem;
    }

    .source-chip {
      border: 1px solid var(--mat-sys-outline-variant, #cbd5e1);
      border-radius: 999px;
      padding: 0.25rem 0.55rem;
      background: var(--mat-sys-surface-container-low, #f8fafc);
      color: var(--mat-sys-on-surface, #0f172a);
      font-size: 0.85rem;
      font-weight: 650;
    }

    .source-chip[data-source-type='role'] {
      border-color: color-mix(in srgb, var(--mat-sys-primary, #2563eb) 45%, #cbd5e1);
    }

    .source-chip[data-source-type='group'] {
      border-color: color-mix(in srgb, var(--mat-sys-tertiary, #0d9488) 45%, #cbd5e1);
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

    @media (max-width: 48rem) {
      .permission-row,
      .grant-sources {
        justify-content: flex-start;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxEffectivePermissionsComponent {
  private readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });

  @Output() readonly permissionsLoaded = new EventEmitter<StynxEffectivePermissions>();

  readonly currentUserId = signal('');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly search = signal('');
  readonly permissionsSnapshot = signal<StynxEffectivePermissions>({ userId: '', permissions: [] });

  readonly filterForm = this.formBuilder.group({
    q: [''],
  });

  readonly permissions = computed(() => this.permissionsSnapshot().permissions.map((grant) => normalizeGrant(grant)));
  readonly filteredPermissions = computed(() => this.permissions().filter((permission) => includesSearch(permission, this.search())));
  readonly grantSourceCount = computed(() => this.filteredPermissions().reduce((count, permission) => count + permission.grant.grantedBy.length, 0));

  @Input()
  set userId(value: string | null | undefined) {
    const userId = value ?? '';
    this.currentUserId.set(userId);
    this.clearSearch();
    if (userId) {
      this.load(userId);
    } else {
      this.permissionsSnapshot.set({ userId: '', permissions: [] });
      this.error.set('');
      this.loading.set(false);
    }
  }

  protected applySearch(): void {
    this.search.set(this.filterForm.controls.q.value.trim());
  }

  protected clearSearch(): void {
    this.filterForm.reset({ q: '' });
    this.search.set('');
  }

  protected refresh(): void {
    const userId = this.currentUserId();
    if (userId) {
      this.load(userId);
    }
  }

  protected emptyTitleKey(): string {
    return this.search()
      ? 'iam.effectivePermissions.emptySearch.title'
      : 'iam.effectivePermissions.empty.title';
  }

  protected emptyDescriptionKey(): string {
    return this.search()
      ? 'iam.effectivePermissions.emptySearch.description'
      : 'iam.effectivePermissions.empty.description';
  }

  protected sourceTypeKey(type: 'role' | 'group'): string {
    return `iam.effectivePermissions.source.${type}`;
  }

  private load(userId: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.getEffectivePermissions(userId).subscribe({
      next: (permissions) => {
        this.loading.set(false);
        this.permissionsSnapshot.set(permissions);
        this.permissionsLoaded.emit(permissions);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof Error ? error.message : this.translate('iam.effectivePermissions.loadFailed'));
      },
    });
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
