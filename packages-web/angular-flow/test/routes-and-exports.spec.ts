import '@angular/compiler';
import * as flow from '../src';
import { StynxFlowDashboardComponent, StynxFlowOpenTasksComponent, StynxFlowRunSummaryComponent } from '../src/analytics.component';
import { StynxFlowFillsComponent } from '../src/flow-fills.component';
import { StynxFlowFormsComponent } from '../src/flow-forms.component';
import { StynxFlowGraphDesignerComponent } from '../src/flow-graph-designer.component';
import { StynxFlowRunActivityComponent } from '../src/flow-run-activity.component';
import { StynxFlowMyTasksInboxComponent, StynxFlowTaskListComponent } from '../src/flow-tasks.component';
import { StynxFlowWaiversComponent } from '../src/flow-waivers.component';
import { FLOW_ROUTES, flowRoutes } from '../src/routes';

describe('@stynx-web/angular-flow exports and routes', () => {
  it('exports the package API needed by host shells', () => {
    expect(flow.FlowApiService).toEqual(expect.anything());
    expect(flow.FLOW_ROUTES).toEqual(expect.anything());
    expect(flow.flowRoutes).toEqual(expect.anything());
    expect(flow.StynxFlowGraphDesignerComponent).toEqual(expect.anything());
    expect(flow.StynxFlowGraphCanvasComponent).toEqual(expect.anything());
    expect(flow.StynxFlowFormsComponent).toEqual(expect.anything());
    expect(flow.StynxFlowFormEditorComponent).toEqual(expect.anything());
    expect(flow.StynxFlowFillEditorComponent).toEqual(expect.anything());
    expect(flow.StynxFlowMyTasksInboxComponent).toEqual(expect.anything());
    expect(flow.StynxFlowTaskCardComponent).toEqual(expect.anything());
    expect(flow.StynxFlowWaiverDialogComponent).toEqual(expect.anything());
    expect(flow.StynxFlowOpenTasksComponent).toEqual(expect.anything());
  });

  it('returns a defensive copy of host-mountable routes', () => {
    const first = flowRoutes();
    const second = flowRoutes();
    first.pop();
    expect(second).toHaveLength(FLOW_ROUTES.length);
  });

  it('keeps PORM-derived route concepts and STYNX route names visible', () => {
    const paths = flowRoutes().map((route) => route.path);
    expect(paths).toEqual(expect.arrayContaining([
      'scopes/:scopeId/graphs/:graphId',
      'forms',
      'forms/:formId',
      'forms/:formId/fills/:fillId',
      'fills',
      'fills/:fillId',
      'assignments',
      'my-tasks',
      'tasks/:taskId',
      'waivers',
      'open-tasks',
      'summary',
      'policies',
    ]));
  });

  it('keeps each flow route mounted to the intended component and guarded permission surface', () => {
    const routes = flowRoutes();

    expect(routes.map((route) => ({
      path: route.path,
      component: route.component,
      guardCount: route.canActivate?.length ?? 0,
    }))).toEqual([
      { path: 'scopes/:scopeId/graphs/:graphId', component: StynxFlowGraphDesignerComponent, guardCount: 1 },
      { path: 'forms', component: StynxFlowFormsComponent, guardCount: 1 },
      { path: 'forms/:formId', component: StynxFlowFormsComponent, guardCount: 1 },
      { path: 'forms/:formId/fills/:fillId', component: StynxFlowFillsComponent, guardCount: 1 },
      { path: 'fills', component: StynxFlowFillsComponent, guardCount: 1 },
      { path: 'fills/:fillId', component: StynxFlowFillsComponent, guardCount: 1 },
      { path: 'assignments', component: StynxFlowTaskListComponent, guardCount: 1 },
      { path: 'my-tasks', component: StynxFlowMyTasksInboxComponent, guardCount: 1 },
      { path: 'tasks/:taskId', component: StynxFlowTaskListComponent, guardCount: 1 },
      { path: 'runs/:runId/activity', component: StynxFlowRunActivityComponent, guardCount: 1 },
      { path: 'waivers', component: StynxFlowWaiversComponent, guardCount: 1 },
      { path: 'dashboard', component: StynxFlowDashboardComponent, guardCount: 1 },
      { path: 'open-tasks', component: StynxFlowOpenTasksComponent, guardCount: 1 },
      { path: 'summary', component: StynxFlowRunSummaryComponent, guardCount: 1 },
      { path: 'policies', component: StynxFlowGraphDesignerComponent, guardCount: 1 },
    ]);
  });
});
