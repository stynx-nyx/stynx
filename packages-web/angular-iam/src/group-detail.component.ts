import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-web/angular-i18n';
import {
  EmptyStateComponent,
  StynxBannerComponent,
  StynxIconComponent,
  StynxLoadingSpinnerComponent,
  StynxToastService,
} from '@stynx-web/angular-ui';
import { StynxGroupMembersEditorComponent } from './group-members-editor.component';
import { StynxGroupRolesEditorComponent } from './group-roles-editor.component';
import { IamApiService } from './iam-api.service';
import type { StynxGroup, StynxPatchGroupRequest } from './types';

type GroupDetailTab = 'overview' | 'roles' | 'members';

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

@Component({
  selector: 'stynx-group-detail',
  standalone: true,
  imports: [
    EmptyStateComponent,
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxGroupMembersEditorComponent,
    StynxGroupRolesEditorComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
  ],
  template: `
    <section class="stynx-iam-group-detail">
      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.groups.detail.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      }

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.groups.detail.errorTitle' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (group(); as currentGroup) {
        <header class="detail-header">
          <div>
            <h1>{{ currentGroup.name }}</h1>
            <p><code>{{ currentGroup.key }}</code></p>
          </div>
          <div class="facts">
            <span>
              {{ currentGroup.rolesCount ?? 0 }}
              {{ 'iam.groups.fields.rolesCount' | stynxTranslate }}
            </span>
            <span>
              {{ currentGroup.membersCount ?? 0 }}
              {{ 'iam.groups.fields.membersCount' | stynxTranslate }}
            </span>
          </div>
        </header>

        <nav class="tabs" [attr.aria-label]="'iam.groups.detail.tabsLabel' | stynxTranslate">
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
                  <span>{{ 'iam.groups.fields.key' | stynxTranslate }}</span>
                  <input formControlName="key" autocomplete="off" />
                </label>
                <label>
                  <span>{{ 'iam.groups.fields.name' | stynxTranslate }}</span>
                  <input formControlName="name" autocomplete="off" />
                </label>
              </div>
              <label>
                <span>{{ 'iam.groups.fields.description' | stynxTranslate }}</span>
                <textarea formControlName="description" rows="4"></textarea>
              </label>
              <dl>
                <div>
                  <dt>{{ 'iam.groups.fields.createdAt' | stynxTranslate }}</dt>
                  <dd>{{ currentGroup.createdAt || ('iam.common.unknown' | stynxTranslate) }}</dd>
                </div>
                <div>
                  <dt>{{ 'iam.groups.fields.updatedAt' | stynxTranslate }}</dt>
                  <dd>{{ currentGroup.updatedAt || ('iam.common.unknown' | stynxTranslate) }}</dd>
                </div>
                <div>
                  <dt>{{ 'iam.groups.fields.tenantId' | stynxTranslate }}</dt>
                  <dd>{{ currentGroup.tenantId || ('iam.common.unknown' | stynxTranslate) }}</dd>
                </div>
              </dl>
              <footer>
                @if (saving()) {
                  <stynx-loading-spinner
                    [size]="1"
                    [label]="'iam.groups.detail.saving' | stynxTranslate"
                  ></stynx-loading-spinner>
                }
                <button type="submit" [disabled]="overviewForm.invalid || saving()">
                  <stynx-icon name="save" aria-hidden="true"></stynx-icon>
                  {{ 'iam.groups.actions.save' | stynxTranslate }}
                </button>
              </footer>
            </form>
          }
          @case ('roles') {
            <stynx-group-roles-editor
              [groupId]="currentGroup.id"
              (rolesChanged)="rolesChanged.emit($event)"
            ></stynx-group-roles-editor>
          }
          @case ('members') {
            <stynx-group-members-editor
              [groupId]="currentGroup.id"
              (membersChanged)="membersChanged.emit($event)"
            ></stynx-group-members-editor>
          }
        }
      } @else if (!loading()) {
        <stynx-empty-state
          [title]="'iam.groups.detail.empty.title' | stynxTranslate"
          [description]="'iam.groups.detail.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      }
    </section>
  `,
  styles: [`
    .stynx-iam-group-detail {
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
export class StynxGroupDetailComponent {
  private readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly groupChanged = new EventEmitter<StynxGroup>();
  @Output() readonly rolesChanged = new EventEmitter<string[]>();
  @Output() readonly membersChanged = new EventEmitter<string[]>();

  readonly tabs: GroupDetailTab[] = ['overview', 'roles', 'members'];
  readonly group = signal<StynxGroup | null>(null);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly activeTab = signal<GroupDetailTab>('overview');

  readonly overviewForm = this.formBuilder.group({
    key: ['', [Validators.required]],
    name: ['', [Validators.required]],
    description: [''],
  });

  @Input()
  set groupId(value: string | null | undefined) {
    if (value) {
      this.load(value);
    } else {
      this.group.set(null);
    }
  }

  protected tabKey(tab: GroupDetailTab): string {
    return `iam.groups.detail.tabs.${tab}`;
  }

  protected saveOverview(): void {
    const group = this.group();
    if (!group || this.overviewForm.invalid) {
      this.overviewForm.markAllAsTouched();
      return;
    }

    const value = this.overviewForm.getRawValue();
    const diff: StynxPatchGroupRequest = {
      key: value.key.trim(),
      name: value.name.trim(),
    };
    const description = optionalText(value.description);
    if (description) {
      diff.description = description;
    }

    this.saving.set(true);
    this.error.set('');
    this.api.patchGroup(group.id, diff).subscribe({
      next: (updated) => {
        this.saving.set(false);
        this.applyGroup(updated);
        this.groupChanged.emit(updated);
        this.toast?.push(this.translate('iam.groups.detail.saved'), 'success');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errorMessage(error, 'iam.groups.detail.saveFailed'));
      },
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    this.api.listGroups().subscribe({
      next: (groups) => {
        this.loading.set(false);
        const group = groups.find((candidate) => candidate.id === id) ?? null;
        this.group.set(group);
        if (group) {
          this.applyGroup(group);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.groups.detail.loadFailed'));
      },
    });
  }

  private applyGroup(group: StynxGroup): void {
    this.group.set(group);
    this.overviewForm.reset({
      key: group.key,
      name: group.name,
      description: group.description ?? '',
    });
  }

  private errorMessage(error: unknown, fallbackKey: string): string {
    return error instanceof Error ? error.message : this.translate(fallbackKey);
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
