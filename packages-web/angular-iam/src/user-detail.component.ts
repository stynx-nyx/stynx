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
import { forkJoin } from 'rxjs';
import { IamApiService } from './iam-api.service';
import { StynxUserDisableConfirmDialogComponent } from './user-disable-confirm-dialog.component';
import type {
  StynxEffectivePermissions,
  StynxGroup,
  StynxPatchUserRequest,
  StynxRole,
  StynxUser,
  StynxUserDetail,
} from './types';

type UserDetailTab = 'overview' | 'roles' | 'groups' | 'permissions' | 'sessions' | 'audit';

interface UserDetailSnapshot {
  user: StynxUserDetail;
  assignedRoles: StynxRole[];
  assignedGroups: StynxGroup[];
  roles: StynxRole[];
  groups: StynxGroup[];
  permissions: StynxEffectivePermissions;
}

function optionalText(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isAssigned(id: string, selected: ReadonlySet<string>): boolean {
  return selected.has(id);
}

@Component({
  selector: 'stynx-user-detail',
  standalone: true,
  imports: [
    EmptyStateComponent,
    ReactiveFormsModule,
    StynxBannerComponent,
    StynxIconComponent,
    StynxLoadingSpinnerComponent,
    StynxTranslatePipe,
    StynxUserDisableConfirmDialogComponent,
  ],
  template: `
    <section class="stynx-iam-user-detail">
      @if (loading()) {
        <stynx-loading-spinner
          [label]="'iam.users.detail.loading' | stynxTranslate"
        ></stynx-loading-spinner>
      }

      @if (error()) {
        <stynx-banner
          tone="error"
          [title]="'iam.users.detail.errorTitle' | stynxTranslate"
          [message]="error()"
        ></stynx-banner>
      }

      @if (user(); as currentUser) {
        <header class="detail-header">
          <div>
            <h1>{{ displayName(currentUser) }}</h1>
            <p>{{ currentUser.email }}</p>
          </div>
          <div class="actions">
            <button type="button" class="secondary" (click)="sendInvite()">
              <stynx-icon name="user" aria-hidden="true"></stynx-icon>
              {{ 'iam.users.actions.invite' | stynxTranslate }}
            </button>
            <button type="button" class="secondary" (click)="forceLogout()">
              <stynx-icon name="arrow-right" aria-hidden="true"></stynx-icon>
              {{ 'iam.users.actions.forceLogout' | stynxTranslate }}
            </button>
            @if (currentUser.status === 'disabled') {
              <button type="button" (click)="reactivate()">
                <stynx-icon name="check" aria-hidden="true"></stynx-icon>
                {{ 'iam.users.actions.reactivate' | stynxTranslate }}
              </button>
            } @else {
              <button type="button" class="danger" (click)="disableDialogOpen.set(true)">
                <stynx-icon name="warning" aria-hidden="true"></stynx-icon>
                {{ 'iam.users.actions.disable' | stynxTranslate }}
              </button>
            }
          </div>
        </header>

        <nav class="tabs" [attr.aria-label]="'iam.users.detail.tabsLabel' | stynxTranslate">
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
              <label>
                <span>{{ 'iam.users.fields.email' | stynxTranslate }}</span>
                <input formControlName="email" type="email" autocomplete="email" />
              </label>
              <div class="field-grid">
                <label>
                  <span>{{ 'iam.users.fields.firstName' | stynxTranslate }}</span>
                  <input formControlName="firstName" autocomplete="given-name" />
                </label>
                <label>
                  <span>{{ 'iam.users.fields.lastName' | stynxTranslate }}</span>
                  <input formControlName="lastName" autocomplete="family-name" />
                </label>
              </div>
              <label>
                <span>{{ 'iam.users.fields.locale' | stynxTranslate }}</span>
                <input formControlName="locale" autocomplete="language" />
              </label>
              <dl>
                <div>
                  <dt>{{ 'iam.users.fields.status' | stynxTranslate }}</dt>
                  <dd>{{ statusKey(currentUser) | stynxTranslate }}</dd>
                </div>
                <div>
                  <dt>{{ 'iam.users.fields.createdAt' | stynxTranslate }}</dt>
                  <dd>{{ currentUser.createdAt || ('iam.common.unknown' | stynxTranslate) }}</dd>
                </div>
                <div>
                  <dt>{{ 'iam.users.fields.lastLoginAt' | stynxTranslate }}</dt>
                  <dd>{{ currentUser.lastLoginAt || ('iam.common.never' | stynxTranslate) }}</dd>
                </div>
              </dl>
              <footer>
                @if (saving()) {
                  <stynx-loading-spinner
                    [size]="1"
                    [label]="'iam.users.detail.saving' | stynxTranslate"
                  ></stynx-loading-spinner>
                }
                <button type="submit" [disabled]="overviewForm.invalid || saving()">
                  <stynx-icon name="save" aria-hidden="true"></stynx-icon>
                  {{ 'iam.users.actions.save' | stynxTranslate }}
                </button>
              </footer>
            </form>
          }
          @case ('roles') {
            <section class="assignment-panel">
              <header>
                <h2>{{ 'iam.users.roles.title' | stynxTranslate }}</h2>
                <button type="button" (click)="saveRoles()" [disabled]="saving()">
                  <stynx-icon name="save" aria-hidden="true"></stynx-icon>
                  {{ 'iam.users.roles.save' | stynxTranslate }}
                </button>
              </header>
              @if (roles().length === 0) {
                <stynx-empty-state
                  [title]="'iam.users.roles.empty.title' | stynxTranslate"
                  [description]="'iam.users.roles.empty.description' | stynxTranslate"
                ></stynx-empty-state>
              } @else {
                <div class="assignment-list">
                  @for (role of roles(); track role.id) {
                    <label class="check-item">
                      <input
                        type="checkbox"
                        [checked]="roleAssigned(role.id)"
                        (change)="toggleRole(role.id)"
                      />
                      <span>
                        <strong>{{ role.name }}</strong>
                        <small>{{ role.key }}</small>
                      </span>
                    </label>
                  }
                </div>
              }
            </section>
          }
          @case ('groups') {
            <section class="assignment-panel">
              <header>
                <h2>{{ 'iam.users.groups.title' | stynxTranslate }}</h2>
                <button type="button" (click)="saveGroups()" [disabled]="saving()">
                  <stynx-icon name="save" aria-hidden="true"></stynx-icon>
                  {{ 'iam.users.groups.save' | stynxTranslate }}
                </button>
              </header>
              @if (groups().length === 0) {
                <stynx-empty-state
                  [title]="'iam.users.groups.empty.title' | stynxTranslate"
                  [description]="'iam.users.groups.empty.description' | stynxTranslate"
                ></stynx-empty-state>
              } @else {
                <div class="assignment-list">
                  @for (group of groups(); track group.id) {
                    <label class="check-item">
                      <input
                        type="checkbox"
                        [checked]="groupAssigned(group.id)"
                        (change)="toggleGroup(group.id)"
                      />
                      <span>
                        <strong>{{ group.name }}</strong>
                        <small>{{ group.key }}</small>
                      </span>
                    </label>
                  }
                </div>
              }
            </section>
          }
          @case ('permissions') {
            @if (effectivePermissions().permissions.length === 0) {
              <stynx-empty-state
                [title]="'iam.users.permissions.empty.title' | stynxTranslate"
                [description]="'iam.users.permissions.empty.description' | stynxTranslate"
              ></stynx-empty-state>
            } @else {
              <div class="permission-list">
                @for (grant of effectivePermissions().permissions; track grant.permission.key) {
                  <article>
                    <strong>{{ grant.permission.key }}</strong>
                    <span>{{ grant.permission.description || ('iam.users.permissions.noDescription' | stynxTranslate) }}</span>
                    <small>
                      {{ 'iam.users.permissions.grantedBy' | stynxTranslate }}
                      @for (source of grant.grantedBy; track source.type + source.id) {
                        <b>{{ grantSourceKey(source.type) | stynxTranslate }}: {{ source.name || source.key || source.id }}</b>
                      }
                    </small>
                  </article>
                }
              </div>
            }
          }
          @case ('sessions') {
            <stynx-empty-state
              [title]="'iam.users.sessions.empty.title' | stynxTranslate"
              [description]="'iam.users.sessions.empty.description' | stynxTranslate"
            ></stynx-empty-state>
          }
          @case ('audit') {
            <stynx-empty-state
              [title]="'iam.users.audit.empty.title' | stynxTranslate"
              [description]="'iam.users.audit.empty.description' | stynxTranslate"
            ></stynx-empty-state>
          }
        }

        <stynx-user-disable-confirm-dialog
          [open]="disableDialogOpen()"
          [user]="currentUser"
          (confirm)="disableUser()"
          (dismissed)="disableDialogOpen.set(false)"
        ></stynx-user-disable-confirm-dialog>
      }
    </section>
  `,
  styles: [`
    .stynx-iam-user-detail {
      display: grid;
      gap: 1rem;
      color: var(--mat-sys-on-surface, #0f172a);
    }

    .detail-header,
    .actions,
    .tabs,
    footer,
    .assignment-panel header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
    }

    .detail-header,
    .assignment-panel header {
      justify-content: space-between;
    }

    h1,
    h2,
    p {
      margin: 0;
    }

    h1 {
      font-size: 1.5rem;
    }

    h2 {
      font-size: 1.05rem;
    }

    p,
    small,
    dt {
      color: var(--mat-sys-on-surface-variant, #475569);
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

    .overview,
    .assignment-panel,
    .assignment-list,
    .permission-list {
      display: grid;
      gap: 1rem;
    }

    label {
      display: grid;
      gap: 0.35rem;
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

    input[type='checkbox'] {
      width: auto;
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.75rem;
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

    .check-item {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.75rem;
    }

    .check-item span,
    .permission-list article {
      display: grid;
      gap: 0.25rem;
    }

    .permission-list article {
      border: 1px solid var(--mat-sys-outline-variant, #d8dee9);
      border-radius: 8px;
      padding: 0.75rem;
    }

    .permission-list small {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
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

    button.danger {
      border-color: var(--mat-sys-error, #dc2626);
      background: var(--mat-sys-error, #dc2626);
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
export class StynxUserDetailComponent {
  private readonly api = inject(IamApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly i18n = inject(StynxI18nService, { optional: true });
  private readonly toast = inject(StynxToastService, { optional: true });

  @Output() readonly userChanged = new EventEmitter<StynxUserDetail>();
  @Output() readonly membershipChanged = new EventEmitter<void>();

  readonly tabs: UserDetailTab[] = ['overview', 'roles', 'groups', 'permissions', 'sessions', 'audit'];
  readonly user = signal<StynxUserDetail | null>(null);
  readonly roles = signal<StynxRole[]>([]);
  readonly groups = signal<StynxGroup[]>([]);
  readonly assignedRoleIds = signal<ReadonlySet<string>>(new Set());
  readonly assignedGroupIds = signal<ReadonlySet<string>>(new Set());
  readonly effectivePermissions = signal<StynxEffectivePermissions>({ userId: '', permissions: [] });
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly disableDialogOpen = signal(false);
  readonly activeTab = signal<UserDetailTab>('overview');
  readonly currentUserId = computed(() => this.user()?.id ?? '');

  readonly overviewForm = this.formBuilder.group({
    email: ['', [Validators.required, Validators.email]],
    firstName: [''],
    lastName: [''],
    locale: ['en-US', [Validators.required]],
  });

  @Input()
  set userId(value: string | null | undefined) {
    if (value) {
      this.load(value);
    }
  }

  protected tabKey(tab: UserDetailTab): string {
    return `iam.users.detail.tabs.${tab}`;
  }

  protected displayName(user: StynxUser): string {
    return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
  }

  protected statusKey(user: StynxUser): string {
    return `iam.users.status.${user.status || 'active'}`;
  }

  protected grantSourceKey(type: 'role' | 'group'): string {
    return `iam.users.permissions.source.${type}`;
  }

  protected roleAssigned(id: string): boolean {
    return isAssigned(id, this.assignedRoleIds());
  }

  protected groupAssigned(id: string): boolean {
    return isAssigned(id, this.assignedGroupIds());
  }

  protected toggleRole(id: string): void {
    this.assignedRoleIds.update((current) => this.toggleSet(current, id));
  }

  protected toggleGroup(id: string): void {
    this.assignedGroupIds.update((current) => this.toggleSet(current, id));
  }

  protected saveOverview(): void {
    const id = this.currentUserId();
    if (!id || this.overviewForm.invalid) {
      this.overviewForm.markAllAsTouched();
      return;
    }

    const value = this.overviewForm.getRawValue();
    const diff: StynxPatchUserRequest = {
      email: value.email.trim(),
    };
    const firstName = optionalText(value.firstName);
    const lastName = optionalText(value.lastName);
    const locale = optionalText(value.locale);
    if (firstName) {
      diff.firstName = firstName;
    }
    if (lastName) {
      diff.lastName = lastName;
    }
    if (locale) {
      diff.locale = locale;
    }

    this.saving.set(true);
    this.error.set('');
    this.api.patchUser(id, diff).subscribe({
      next: (user) => {
        this.saving.set(false);
        this.applyUser(user);
        this.userChanged.emit(user);
        this.toast?.push(this.translate('iam.users.detail.saved'), 'success');
      },
      error: (error: unknown) => this.failSave(error, 'iam.users.detail.saveFailed'),
    });
  }

  protected saveRoles(): void {
    const id = this.currentUserId();
    if (!id) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.setUserRoles(id, [...this.assignedRoleIds()]).subscribe({
      next: () => {
        this.saving.set(false);
        this.membershipChanged.emit();
        this.toast?.push(this.translate('iam.users.roles.saved'), 'success');
      },
      error: (error: unknown) => this.failSave(error, 'iam.users.roles.saveFailed'),
    });
  }

  protected saveGroups(): void {
    const id = this.currentUserId();
    if (!id) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api.setUserGroups(id, [...this.assignedGroupIds()]).subscribe({
      next: () => {
        this.saving.set(false);
        this.membershipChanged.emit();
        this.toast?.push(this.translate('iam.users.groups.saved'), 'success');
      },
      error: (error: unknown) => this.failSave(error, 'iam.users.groups.saveFailed'),
    });
  }

  protected sendInvite(): void {
    this.lifecycleAction('inviteUser', 'iam.users.invite.sent', 'iam.users.invite.failed');
  }

  protected forceLogout(): void {
    this.lifecycleAction('forceLogoutUser', 'iam.users.forceLogout.done', 'iam.users.forceLogout.failed');
  }

  protected reactivate(): void {
    this.lifecycleAction('reactivateUser', 'iam.users.reactivate.done', 'iam.users.reactivate.failed', true);
  }

  protected disableUser(): void {
    this.disableDialogOpen.set(false);
    this.lifecycleAction('disableUser', 'iam.users.disable.done', 'iam.users.disable.failed', true);
  }

  private load(id: string): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({
      user: this.api.getUser(id),
      assignedRoles: this.api.listUserRoles(id),
      assignedGroups: this.api.listUserGroups(id),
      roles: this.api.listRoles(),
      groups: this.api.listGroups(),
      permissions: this.api.getEffectivePermissions(id),
    }).subscribe({
      next: (snapshot) => this.applySnapshot(snapshot),
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(this.errorMessage(error, 'iam.users.detail.loadFailed'));
      },
    });
  }

  private applySnapshot(snapshot: UserDetailSnapshot): void {
    this.loading.set(false);
    this.applyUser(snapshot.user);
    this.roles.set(snapshot.roles);
    this.groups.set(snapshot.groups);
    this.assignedRoleIds.set(new Set(snapshot.assignedRoles.map((role) => role.id)));
    this.assignedGroupIds.set(new Set(snapshot.assignedGroups.map((group) => group.id)));
    this.effectivePermissions.set(snapshot.permissions);
  }

  private applyUser(user: StynxUserDetail): void {
    this.user.set(user);
    this.overviewForm.reset({
      email: user.email,
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      locale: user.locale ?? 'en-US',
    });
  }

  private lifecycleAction(
    method: 'disableUser' | 'reactivateUser' | 'inviteUser' | 'forceLogoutUser',
    successKey: string,
    failureKey: string,
    reload = false,
  ): void {
    const id = this.currentUserId();
    if (!id) {
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.api[method](id).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast?.push(this.translate(successKey), 'success');
        if (reload) {
          this.load(id);
        }
      },
      error: (error: unknown) => this.failSave(error, failureKey),
    });
  }

  private toggleSet(current: ReadonlySet<string>, id: string): ReadonlySet<string> {
    const next = new Set(current);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    return next;
  }

  private failSave(error: unknown, fallbackKey: string): void {
    this.saving.set(false);
    this.error.set(this.errorMessage(error, fallbackKey));
  }

  private errorMessage(error: unknown, fallbackKey: string): string {
    return error instanceof Error ? error.message : this.translate(fallbackKey);
  }

  private translate(key: string): string {
    return this.i18n?.translate(key) ?? key;
  }
}
