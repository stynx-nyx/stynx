import type { Routes } from '@angular/router';
import { stynxPermissionGuard } from '@stynx-nyx/angular-auth';
import { StynxFlowDashboardComponent, StynxFlowOpenTasksComponent, StynxFlowRunSummaryComponent } from './analytics.component';
import { StynxFlowFillsComponent } from './flow-fills.component';
import { StynxFlowFormsComponent } from './flow-forms.component';
import { StynxFlowGraphDesignerComponent } from './flow-graph-designer.component';
import { StynxFlowRunActivityComponent } from './flow-run-activity.component';
import { StynxFlowMyTasksInboxComponent, StynxFlowTaskListComponent } from './flow-tasks.component';
import { StynxFlowWaiversComponent } from './flow-waivers.component';

export const FLOW_ROUTES: Routes = [
  {
    path: 'scopes/:scopeId/graphs/:graphId',
    component: StynxFlowGraphDesignerComponent,
    canActivate: [stynxPermissionGuard('flow:read:design')],
  },
  {
    path: 'forms',
    component: StynxFlowFormsComponent,
    canActivate: [stynxPermissionGuard('flow:read:design')],
  },
  {
    path: 'forms/:formId',
    component: StynxFlowFormsComponent,
    canActivate: [stynxPermissionGuard('flow:read:design')],
  },
  {
    path: 'forms/:formId/fills/:fillId',
    component: StynxFlowFillsComponent,
    canActivate: [stynxPermissionGuard('flow:read:runtime')],
  },
  {
    path: 'fills',
    component: StynxFlowFillsComponent,
    canActivate: [stynxPermissionGuard('flow:read:runtime')],
  },
  {
    path: 'fills/:fillId',
    component: StynxFlowFillsComponent,
    canActivate: [stynxPermissionGuard('flow:read:runtime')],
  },
  {
    path: 'assignments',
    component: StynxFlowTaskListComponent,
    canActivate: [stynxPermissionGuard('flow:read:runtime')],
  },
  {
    path: 'my-tasks',
    component: StynxFlowMyTasksInboxComponent,
    canActivate: [stynxPermissionGuard('flow:read:runtime')],
  },
  {
    path: 'tasks/:taskId',
    component: StynxFlowTaskListComponent,
    canActivate: [stynxPermissionGuard('flow:read:runtime')],
  },
  {
    path: 'runs/:runId/activity',
    component: StynxFlowRunActivityComponent,
    canActivate: [stynxPermissionGuard('flow:read:runtime')],
  },
  {
    path: 'waivers',
    component: StynxFlowWaiversComponent,
    canActivate: [stynxPermissionGuard('flow:read:runtime')],
  },
  {
    path: 'dashboard',
    component: StynxFlowDashboardComponent,
    canActivate: [stynxPermissionGuard('flow:read:analytics')],
  },
  {
    path: 'open-tasks',
    component: StynxFlowOpenTasksComponent,
    canActivate: [stynxPermissionGuard('flow:read:analytics')],
  },
  {
    path: 'summary',
    component: StynxFlowRunSummaryComponent,
    canActivate: [stynxPermissionGuard('flow:read:analytics')],
  },
  {
    path: 'policies',
    component: StynxFlowGraphDesignerComponent,
    canActivate: [stynxPermissionGuard('flow:read:design')],
  },
];

export function flowRoutes(): Routes {
  return [...FLOW_ROUTES];
}
