import { JsonPipe } from '@angular/common';
import type { OnInit } from '@angular/core';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ConfirmDialogData } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { ConfirmDialogComponent } from '@shared/components/confirm-dialog/confirm-dialog.component';
import { RolesService } from './roles.service';
import { TenancyService } from './tenancy.service';
import { UsersService } from './users.service';
import type { RoleSummary, TenancySummary, UserDetail } from './models';

@Component({
  standalone: true,
  selector: 'stc-user-detail',
  templateUrl: './user-detail.component.html',
  styleUrls: ['./user-detail.component.scss'],
  imports: [
    MatCardModule,
    MatTabsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDialogModule,
    MatInputModule,
    MatSelectModule,
    MatListModule,
    ReactiveFormsModule,
    RouterLink,
    JsonPipe,
  ],
})
export class UserDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly usersService = inject(UsersService);
  private readonly rolesService = inject(RolesService);
  private readonly tenancyService = inject(TenancyService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);

  readonly accountForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    phoneNumber: [''],
  });

  readonly user = signal<UserDetail | null>(null);
  readonly availableRoles = signal<RoleSummary[]>([]);
  readonly availableTenancies = signal<TenancySummary[]>([]);
  readonly attributes = computed(() => {
    const details = this.user();
    if (!details) {
      return [] as Array<{ key: string; value: unknown }>;
    }
    return Object.entries(details.attributes ?? {}).map(([key, value]) => ({ key, value }));
  });
  tenancySelection = this.fb.control<string | null>(null);

  ngOnInit(): void {
    this.loadUser();
    this.refreshRoles();
    this.refreshTenancies();
  }

  private get userId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  private loadUser(): void {
    const id = this.userId;
    if (!id) {
      return;
    }
    this.usersService
      .getById(id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (detail) => {
          this.user.set(detail);
          this.accountForm.patchValue({
            email: detail.email ?? '',
            phoneNumber: detail.phoneNumber ?? '',
          });
        },
        error: () => {
          this.snackBar.open('Unable to load user details', undefined, { duration: 3000 });
          void this.router.navigate(['/admin/users']);
        },
      });
  }

  private refreshRoles(): void {
    this.rolesService
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe((roles) => {
        const assigned = this.user()?.roles ?? [];
        const assignedIds = new Set(assigned.map((role) => role.id));
        this.availableRoles.set(roles.filter((role) => !assignedIds.has(role.id)));
      });
  }

  private refreshTenancies(): void {
    this.tenancyService
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe((tenancies) => {
        const assigned = this.user()?.tenancies ?? [];
        const assignedIds = new Set(assigned.map((t) => t.id));
        this.availableTenancies.set(tenancies.filter((t) => !assignedIds.has(t.id)));
      });
  }

  saveAccount(): void {
    if (this.accountForm.invalid || !this.user()) {
      return;
    }
    this.usersService
      .updateContact(this.userId, {
        email: this.accountForm.value.email ?? undefined,
        phoneNumber: this.accountForm.value.phoneNumber ?? undefined,
      })
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (detail) => {
          this.user.set(detail);
          this.snackBar.open('Account updated', undefined, { duration: 2500 });
        },
        error: () => this.snackBar.open('Unable to update account', undefined, { duration: 3000 }),
      });
  }

  confirmAccount(): void {
    this.openConfirmDialog({
      title: 'Confirm user account',
      message: 'Send confirmation to this user?',
    })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.usersService
          .confirmUser(this.userId)
          .pipe(takeUntilDestroyed())
          .subscribe(() =>
            this.snackBar.open('Account confirmation triggered', undefined, { duration: 2500 }),
          );
      });
  }

  confirmEmail(): void {
    this.openConfirmDialog({
      title: 'Confirm email',
      message: 'Mark email as verified?',
    })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.usersService
          .confirmEmail(this.userId)
          .pipe(takeUntilDestroyed())
          .subscribe(() =>
            this.snackBar.open('Email confirmation triggered', undefined, { duration: 2500 }),
          );
      });
  }

  confirmPhone(): void {
    this.openConfirmDialog({
      title: 'Confirm phone',
      message: 'Mark phone number as verified?',
    })
      .afterClosed()
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
        this.usersService
          .confirmPhone(this.userId)
          .pipe(takeUntilDestroyed())
          .subscribe(() =>
            this.snackBar.open('Phone confirmation triggered', undefined, { duration: 2500 }),
          );
      });
  }

  addRole(role: RoleSummary): void {
    this.rolesService
      .assign(this.userId, role.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          const user = this.user();
          if (!user) {
            return;
          }
          this.user.set({ ...user, roles: [...user.roles, role] });
          this.refreshRoles();
          this.snackBar.open('Role assigned', undefined, { duration: 2500 });
        },
        error: () => this.snackBar.open('Unable to assign role', undefined, { duration: 3000 }),
      });
  }

  removeRole(role: RoleSummary): void {
    this.rolesService
      .remove(this.userId, role.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          const user = this.user();
          if (!user) {
            return;
          }
          this.user.set({ ...user, roles: user.roles.filter((r) => r.id !== role.id) });
          this.refreshRoles();
          this.snackBar.open('Role removed', undefined, { duration: 2500 });
        },
        error: () => this.snackBar.open('Unable to remove role', undefined, { duration: 3000 }),
      });
  }

  assignTenancy(): void {
    const tenantId = this.tenancySelection.value;
    if (!tenantId) {
      return;
    }
    this.tenancyService
      .assign(this.userId, tenantId)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          const user = this.user();
          const tenancy = this.availableTenancies().find((t) => t.id === tenantId);
          if (user && tenancy) {
            this.user.set({ ...user, tenancies: [...user.tenancies, tenancy] });
            this.refreshTenancies();
            this.tenancySelection.setValue(null);
          }
          this.snackBar.open('Tenancy assigned', undefined, { duration: 2500 });
        },
        error: () => this.snackBar.open('Unable to assign tenancy', undefined, { duration: 3000 }),
      });
  }

  removeTenancy(tenancy: TenancySummary): void {
    this.tenancyService
      .remove(this.userId, tenancy.id)
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: () => {
          const user = this.user();
          if (user) {
            this.user.set({
              ...user,
              tenancies: user.tenancies.filter((t) => t.id !== tenancy.id),
            });
            this.refreshTenancies();
          }
          this.snackBar.open('Tenancy removed', undefined, { duration: 2500 });
        },
        error: () => this.snackBar.open('Unable to remove tenancy', undefined, { duration: 3000 }),
      });
  }

  private openConfirmDialog(data: ConfirmDialogData) {
    return this.dialog.open(ConfirmDialogComponent, { data });
  }
}
