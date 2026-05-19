import type { Routes } from '@angular/router';
import { stynxAuthGuard, stynxPermissionGuard } from '@stynx-web/angular-auth';
import { flowRoutes } from '@stynx-web/angular-flow';
import { iamRoutes } from '@stynx-web/angular-iam';
import { DashboardPageComponent } from './pages/dashboard.page';
import { LoginPageComponent } from './pages/login.page';
import { RecordDetailPageComponent } from './pages/record-detail.page';
import { RecordFormPageComponent } from './pages/record-form.page';
import { RecordsPageComponent } from './pages/records.page';
import { TenantSelectionPageComponent } from './pages/tenant-selection.page';
import { TrashPageComponent } from './pages/trash.page';
import { UnauthorizedPageComponent } from './pages/unauthorized.page';
import { WorkItemDetailPageComponent } from './pages/work-item-detail.page';
import { WorkItemFormPageComponent } from './pages/work-item-form.page';
import { WorkItemsPageComponent } from './pages/work-items.page';

export const APP_ROUTES: Routes = [
  {
    path: 'login',
    component: LoginPageComponent,
    title: 'Login',
  },
  {
    path: 'unauthorized',
    component: UnauthorizedPageComponent,
    title: 'Unauthorized',
  },
  {
    path: 'tenant',
    component: TenantSelectionPageComponent,
    canActivate: [stynxAuthGuard],
    title: 'Tenant',
  },
  {
    path: '',
    component: DashboardPageComponent,
    canActivate: [stynxAuthGuard],
    title: 'Dashboard',
  },
  {
    path: 'records',
    component: RecordsPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:record:read')],
    title: 'Records',
  },
  {
    path: 'records/new',
    component: RecordFormPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:record:write')],
    title: 'New record',
  },
  {
    path: 'records/:id',
    component: RecordDetailPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:record:read')],
    title: 'Record detail',
  },
  {
    path: 'records/:id/edit',
    component: RecordFormPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:record:write')],
    title: 'Edit record',
  },
  {
    path: 'work-items',
    component: WorkItemsPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:work-item:read')],
    title: 'Work items',
  },
  {
    path: 'work-items/new',
    component: WorkItemFormPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:work-item:write')],
    title: 'New work item',
  },
  {
    path: 'work-items/:id/edit',
    component: WorkItemFormPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:work-item:write')],
    title: 'Edit work item',
  },
  {
    path: 'work-items/:id',
    component: WorkItemDetailPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:work-item:read')],
    title: 'Work item detail',
  },
  {
    path: 'trash',
    component: TrashPageComponent,
    canActivate: [stynxAuthGuard, stynxPermissionGuard('sample:record:read')],
    title: 'Trash',
  },
  {
    path: 'flow',
    canActivate: [stynxAuthGuard],
    children: flowRoutes(),
    title: 'Flow',
  },
  {
    path: 'admin',
    canActivate: [stynxAuthGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'users',
      },
      ...iamRoutes(),
    ],
    title: 'Admin',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
