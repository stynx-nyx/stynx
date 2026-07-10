import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { StynxI18nService, StynxTranslatePipe } from '@stynx-nyx/angular-i18n';
import { EmptyStateComponent, StynxBannerComponent, StynxLoadingSpinnerComponent, StynxToastService } from '@stynx-nyx/angular-ui';
import { forkJoin } from 'rxjs';
import { IamApiService } from './iam-api.service';
import type { StynxUser } from './types';

function userDisplayName(user: StynxUser): string {
  return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
}

function includesUserSearch(user: StynxUser, search: string): boolean {
  const value = search.trim().toLowerCase();
  if (!value) {
    return true;
  }
  return [userDisplayName(user), user.email, user.status ?? ''].some((part) => part.toLowerCase().includes(value));
}

@Component({
  selector: 'stynx-group-members-editor',
  standalone: true,
  imports: [EmptyStateComponent, ReactiveFormsModule, StynxBannerComponent, StynxLoadingSpinnerComponent, StynxTranslatePipe],
  template: `
    <section class="stynx-group-members-editor">
      <header>
        <div>
          <h2>{{ 'iam.groups.members.title' | stynxTranslate }}</h2>
          <p>{{ 'iam.groups.members.description' | stynxTranslate }}</p>
        </div>
        <button type="button" [disabled]="saving() || !currentGroupId()" (click)="save()">
          {{ 'iam.groups.members.save' | stynxTranslate }}
        </button>
      </header>

      <form class="toolbar" [formGroup]="searchForm" (ngSubmit)="search()">
        <label>
          <span>{{ 'iam.groups.members.search.label' | stynxTranslate }}</span>
          <input formControlName="q" type="search" [placeholder]="'iam.groups.members.search.placeholder' | stynxTranslate" />
        </label>
        <button type="submit" class="secondary">
          {{ 'iam.groups.members.search.submit' | stynxTranslate }}
        </button>
        <button type="button" class="secondary" (click)="clearSearch()">
          {{ 'iam.groups.members.search.clear' | stynxTranslate }}
        </button>
      </form>

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.groups.members.errorTitle' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.groups.members.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      } @else if (filteredUsers().length === 0) {
        <stynx-empty-state
          [title]="'iam.groups.members.empty.title' | stynxTranslate"
          [description]="'iam.groups.members.empty.description' | stynxTranslate"
        ></stynx-empty-state>
      } @else {
        <div class="selection-list">
          @for (user of filteredUsers(); track user.id) {
            <label class="selection-row">
              <input
                type="checkbox"
                [checked]="hasMember(user.id)"
                [disabled]="saving()"
                (change)="toggleMember(user.id)"
              />
              <span>
                <strong>{{ displayName(user) }}</strong>
                <small>{{ user.email }}</small>
                @if (user.status) {
                  <small>{{ statusKey(user) | stynxTranslate }}</small>
                }
              </span>
            </label>
          }
        </div>
      }

      @if (saving()) {
        <stynx-loading-spinner
          [size]="1"
          [label]="'iam.groups.members.saving' | stynxTranslate"
        ></stynx-loading-spinner>
      }
    </section>
  `,
  styles: [`
    .stynx-group-members-editor {
      display: grid;
      gap: 1rem;
    }

    header,
    .toolbar,
    .selection-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    header {
      flex-wrap: wrap;
      justify-content: space-between;
    }

    .toolbar {
      flex-wrap: wrap;
      justify-content: flex-start;
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
    small {
      color: var(--mat-sys-on-surface-variant, #475569);
    }

    label {
      font-weight: 650;
    }

    .toolbar label {
      display: grid;
      gap: 0.35rem;
      min-width: min(24rem, 100%);
    }

    input[type='search'] {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.65rem 0.75rem;
      color: inherit;
      background: var(--mat-sys-surface, #ffffff);
      font: inherit;
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

    button {
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StynxGroupMembersEditorComponent {
  private readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly membersChanged = new EventEmitter<string[]>();

  readonly currentGroupId = signal('');
  readonly users = signal<StynxUser[]>([]);
  readonly assignedMemberIds = signal<ReadonlySet<string>>(new Set());
  readonly searchText = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly selectedMemberIds = computed(() => [...this.assignedMemberIds()]);
  readonly filteredUsers = computed(() => this.users().filter((user) => includesUserSearch(user, this.searchText())));

  readonly searchForm = this.formBuilder.group({
    q: [''],
  });

  @Input()
  set groupId(value: string | null | undefined) {
    const id = value ?? '';
    this.currentGroupId.set(id);
    if (id) {
      this.load(id);
    } else {
      this.users.set([]);
      this.assignedMemberIds.set(new Set());
    }
  }

  protected displayName(user: StynxUser): string {
    return userDisplayName(user);
  }

  protected statusKey(user: StynxUser): string {
    return `iam.users.status.${user.status || 'active'}`;
  }

  protected hasMember(id: string): boolean {
    return this.assignedMemberIds().has(id);
  }

  protected toggleMember(id: string): void {
    this.assignedMemberIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected search(): void {
    this.searchText.set(this.searchForm.controls.q.value.trim());
  }

  protected clearSearch(): void {
    this.searchForm.reset({ q: '' });
    this.searchText.set('');
  }

  protected save(): void {
    const id = this.currentGroupId();
    if (!id) {
      return;
    }
    const userIds = this.selectedMemberIds();
    this.saving.set(true);
    this.error.set('');
    this.api.setGroupMembers(id, userIds).subscribe({
      next: () => {
        this.saving.set(false);
        this.membersChanged.emit(userIds);
        this.toast?.push(this.translate('iam.groups.members.saved'), 'success');
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.error.set(this.errorMessage(error, 'iam.groups.members.saveFailed'));
      },
    });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      usersPage: this.api.listUsers({ page: 1, pageSize: 100 }),
      assigned: this.api.listGroupMembers(id),
    }).subscribe({
      next: ({ usersPage, assigned }) => {
        this.loading.set(false);
        this.users.set(usersPage.items);
        this.assignedMemberIds.set(new Set(assigned.map((user) => user.id)));
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.groups.members.loadFailed'));
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
