import type { Type } from '@angular/core';
import type { Route, Routes } from '@angular/router';
import { stynxPermissionGuard } from '@stynx-nyx/angular-auth';
import { StynxAuditEventDetailComponent } from './audit-event-detail.component';
import { StynxAuditLogComponent } from './audit-log.component';
import { StynxEntityHistoryComponent } from './entity-history.component';
import { STYNX_AUDIT_DEFAULT_PERMISSION } from './types';

function auditRoute(path: string, component: Type<unknown>, titleKey: string): Route {
  return {
    path,
    component,
    canActivate: [stynxPermissionGuard(STYNX_AUDIT_DEFAULT_PERMISSION)],
    data: {
      permission: STYNX_AUDIT_DEFAULT_PERMISSION,
      titleKey,
    },
  };
}

function cloneRoute(route: Route): Route {
  const cloned: Route = { ...route };
  if (route.canActivate) {
    cloned.canActivate = [...route.canActivate];
  }
  if (route.data) {
    cloned.data = { ...route.data };
  }
  return cloned;
}

export const AUDIT_ROUTES: Routes = [
  auditRoute('', StynxAuditLogComponent, 'audit.routes.log'),
  auditRoute('events/:eventId', StynxAuditEventDetailComponent, 'audit.routes.eventDetail'),
  auditRoute('entities/:resource/:id/history', StynxEntityHistoryComponent, 'audit.routes.entityHistory'),
];

export function auditRoutes(): Routes {
  return AUDIT_ROUTES.map(cloneRoute);
}
