import { Routes } from '@angular/router';
import { AdminUsersComponent } from '@admin/users/admin-users.component';
import { AdminRolesComponent } from '@admin/roles/admin-roles.component';
import { AdminTenanciesComponent } from '@admin/tenancies/admin-tenancies.component';
import { StorageExplorerComponent } from '@storage/storage-explorer.component';
import { LoginComponent } from '@core/auth/login.component';
import { DashboardComponent } from '@shared/layout/dashboard.component';
import { authGuard } from '@core/guards/auth.guard';
import { roleGuard } from '@core/guards/role.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    title: 'Login',
  },
  {
    path: '',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'admin/users', pathMatch: 'full' },
      {
        path: 'admin/users',
        component: AdminUsersComponent,
      },
      {
        path: 'admin/roles',
        component: AdminRolesComponent,
        canActivate: [roleGuard('platform:admin', 'platform:superadmin')],
      },
      {
        path: 'admin/tenancies',
        component: AdminTenanciesComponent,
        canActivate: [roleGuard('platform:admin', 'platform:superadmin')],
      },
      {
        path: 'storage',
        component: StorageExplorerComponent,
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
