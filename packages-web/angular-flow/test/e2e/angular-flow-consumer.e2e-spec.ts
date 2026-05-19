import '@angular/compiler';
import {
  FLOW_ROUTES,
  FlowApiService,
  StynxFlowFormsComponent,
  StynxFlowMyTasksInboxComponent,
  StynxFlowTaskListComponent,
  flowRoutes,
} from '../../src';

describe('@stynx-web/angular-flow consumer E2E', () => {
  it('exposes route definitions and core Flow UI components', () => {
    expect(FlowApiService).toBeDefined();
    expect(StynxFlowFormsComponent).toBeDefined();
    expect(StynxFlowMyTasksInboxComponent).toBeDefined();
    expect(StynxFlowTaskListComponent).toBeDefined();
    expect(flowRoutes()).toEqual(FLOW_ROUTES);
  });
});
