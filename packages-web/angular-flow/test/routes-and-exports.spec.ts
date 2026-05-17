import '@angular/compiler';
import * as flow from '../src';
import { FLOW_ROUTES, flowRoutes } from '../src/routes';

describe('@stynx-web/angular-flow exports and routes', () => {
  it('exports the package API needed by host shells', () => {
    expect(flow.FlowApiService).toBeDefined();
    expect(flow.FLOW_ROUTES).toBeDefined();
    expect(flow.flowRoutes).toBeDefined();
    expect(flow.StynxFlowGraphDesignerComponent).toBeDefined();
    expect(flow.StynxFlowGraphCanvasComponent).toBeDefined();
    expect(flow.StynxFlowFormsComponent).toBeDefined();
    expect(flow.StynxFlowFormEditorComponent).toBeDefined();
    expect(flow.StynxFlowFillEditorComponent).toBeDefined();
    expect(flow.StynxFlowTaskCardComponent).toBeDefined();
    expect(flow.StynxFlowWaiverDialogComponent).toBeDefined();
    expect(flow.StynxFlowOpenTasksComponent).toBeDefined();
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
      'tasks/:taskId',
      'waivers',
      'open-tasks',
      'summary',
      'policies',
    ]));
  });
});
