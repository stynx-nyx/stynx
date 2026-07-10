import type { Type } from '@angular/core';
import type { Route, Routes } from '@angular/router';
import { stynxPermissionGuard } from '@stynx-nyx/angular-auth';
import { StynxGroupDetailComponent } from './group-detail.component';
import { StynxGroupsAdminComponent } from './groups-admin.component';
import { StynxRoleDetailComponent } from './role-detail.component';
import { StynxRolesAdminComponent } from './roles-admin.component';
import { StynxUserDetailComponent } from './user-detail.component';
import { StynxUsersAdminComponent } from './users-admin.component';

type IamPermission = 'iam:users:read' | 'iam:roles:read' | 'iam:groups:read';

function guardedRoute(path: string, component: Type<unknown>, permission: IamPermission): Route {
  return {
    path,
    component,
    canActivate: [stynxPermissionGuard(permission)],
    data: { permission },
  };
}

export const IAM_ROUTES: Routes = [
  guardedRoute('users', StynxUsersAdminComponent, 'iam:users:read'),
  guardedRoute('users/:userId', StynxUserDetailComponent, 'iam:users:read'),
  guardedRoute('roles', StynxRolesAdminComponent, 'iam:roles:read'),
  guardedRoute('roles/:roleId', StynxRoleDetailComponent, 'iam:roles:read'),
  guardedRoute('groups', StynxGroupsAdminComponent, 'iam:groups:read'),
  guardedRoute('groups/:groupId', StynxGroupDetailComponent, 'iam:groups:read'),
];

export function iamRoutes(): Routes {
  return IAM_ROUTES.map((route) => ({
    ...route,
    data: { ...route.data },
  }));
}
