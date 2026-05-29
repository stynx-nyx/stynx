import '@angular/compiler';
import { ChangeDetectionStrategy, Component, Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { STYNX_ANGULAR_AUTH_OPTIONS, StynxSessionService } from '@stynx-web/angular-auth';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { Subject, of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { StynxFlowDashboardComponent, StynxFlowOpenTasksComponent, StynxFlowRunSummaryComponent } from '../src/analytics.component';
import { FlowApiService } from '../src/flow-api.service';
import { StynxFlowFillEditorComponent, StynxFlowFillsComponent } from '../src/flow-fills.component';
import { StynxFlowFormsComponent } from '../src/flow-forms.component';
import { StynxFlowGraphDesignerComponent } from '../src/flow-graph-designer.component';
import { StynxFlowRunActivityComponent } from '../src/flow-run-activity.component';
import { StynxFlowMyTasksInboxComponent, StynxFlowTaskListComponent } from '../src/flow-tasks.component';
import { StynxFlowWaiversComponent } from '../src/flow-waivers.component';
import { flowRoutes } from '../src/routes';
import { STYNX_FLOW_CLIENT, STYNX_FLOW_TENANT_CHANGED, provideStynxFlow } from '../src/tokens';

class FakeI18nService {
  readonly locale = () => 'en-US';

  translate(key: string, params: Record<string, string | number> = {}): string {
    return Object.entries(params).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      key,
    );
  }
}

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RouteHostComponent {}

@Component({
  standalone: true,
  template: '<p>permission denied</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ForbiddenComponent {}

function createPage<T>(data: T[] = [], total = data.length) {
  return { data, meta: { page: 1, pageSize: 25, total } };
}

function createApi() {
  return {
    listScopes: vi.fn(async () => [{ id: 'scope-1', code: 'scope', label: 'Scope', adapterKey: 'test' }]),
    listGraphs: vi.fn(async () => [{ id: 'graph-1', scopeId: 'scope-1', code: 'approval', version: 'v1', status: 'draft', isActive: true }]),
    listGraphNodes: vi.fn(async () => [{ id: 'node-1', graphId: 'graph-1', code: 'review', kind: 'human' }]),
    listGraphEdges: vi.fn(async () => [{ id: 'edge-1', graphId: 'graph-1', fromNodeId: 'start', toNodeId: 'review' }]),
    listForms: vi.fn(async () => []),
    listFills: vi.fn(async () => []),
    listTasks: vi.fn(async () => createPage([{ id: 'task-1', runId: 'run-1', nodeRunId: 'node-run-1', nodeId: 'node-1', assigneeType: 'user', status: 'open', allowedActions: ['approve'] }])),
    listWaivers: vi.fn(async () => []),
    openTasks: vi.fn(async () => createPage([])),
    runsSummary: vi.fn(async () => createPage([])),
    listRunActivity: vi.fn(async () => createPage([{ id: 'event-1', runId: 'run-1', kind: 'task_assigned', note: 'Assigned', createdAt: '2026-05-20T10:00:00.000Z' }], 2)),
    dashboardAnalytics: vi.fn(async () => ({
      openTasks: 8,
      cycleTime: { p50Seconds: 42, p95Seconds: 95 },
      completionRate: { last7Days: 0.25, last30Days: 0.8 },
      slaBreaches: 3,
    })),
  } as unknown as FlowApiService;
}

function createWithApi<T>(api: FlowApiService, factory: () => T): T {
  const injector = Injector.create({
    providers: [{ provide: FlowApiService, useValue: api }],
  });
  return runInInjectionContext(injector, factory);
}

function activatedComponent(router: Router): unknown {
  let route = router.routerState.snapshot.root;
  while (route.firstChild) {
    route = route.firstChild;
  }
  return route.routeConfig?.component;
}

async function configureRouterTest(allowed: boolean) {
  const api = createApi();
  await TestBed.configureTestingModule({
    imports: [RouteHostComponent],
    providers: [
      provideRouter([
        { path: 'forbidden', component: ForbiddenComponent },
        { path: '', children: flowRoutes() },
      ]),
      { provide: FlowApiService, useValue: api },
      { provide: StynxI18nService, useClass: FakeI18nService },
      { provide: StynxSessionService, useValue: { active$: of(allowed), hasAllPermissions: vi.fn(() => allowed) } },
      { provide: STYNX_ANGULAR_AUTH_OPTIONS, useValue: { permissionDeniedPath: '/forbidden' } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(RouteHostComponent);
  fixture.detectChanges();
  return { api, fixture, router: TestBed.inject(Router) };
}

beforeAll(async () => {
  const { BrowserTestingModule, platformBrowserTesting } = await import('@angular/platform-browser/testing');
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (!String(error).includes('Cannot set base providers')) {
      throw error;
    }
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-flow FE-G fan-out', () => {
  it('activates each flow route with the real Router when permissions allow', async () => {
    const { fixture, router } = await configureRouterTest(true);

    for (const [url, expectedComponent] of [
      ['/scopes/scope-1/graphs/graph-1', StynxFlowGraphDesignerComponent],
      ['/forms', StynxFlowFormsComponent],
      ['/forms/form-1', StynxFlowFormsComponent],
      ['/forms/form-1/fills/fill-1', StynxFlowFillsComponent],
      ['/fills', StynxFlowFillsComponent],
      ['/fills/fill-1', StynxFlowFillsComponent],
      ['/assignments', StynxFlowTaskListComponent],
      ['/my-tasks', StynxFlowMyTasksInboxComponent],
      ['/tasks/task-1', StynxFlowTaskListComponent],
      ['/runs/run-1/activity', StynxFlowRunActivityComponent],
      ['/waivers', StynxFlowWaiversComponent],
      ['/dashboard', StynxFlowDashboardComponent],
      ['/open-tasks', StynxFlowOpenTasksComponent],
      ['/summary', StynxFlowRunSummaryComponent],
      ['/policies', StynxFlowGraphDesignerComponent],
    ] as const) {
      await router.navigateByUrl(url);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(router.url).toBe(url);
      expect(activatedComponent(router)).toBe(expectedComponent);
    }
  });

  it('redirects every guarded flow route to permission denial when the session lacks access', async () => {
    const { fixture, router } = await configureRouterTest(false);

    for (const url of [
      '/scopes/scope-1/graphs/graph-1',
      '/forms',
      '/forms/form-1/fills/fill-1',
      '/my-tasks',
      '/runs/run-1/activity',
      '/dashboard',
      '/policies',
    ]) {
      await router.navigateByUrl(url);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(router.url).toBe('/forbidden');
      expect(fixture.nativeElement.textContent).toContain('permission denied');
    }
  });

  it('loads dashboard analytics filters, formats percentages, and ignores stale refreshes', async () => {
    let resolveFirst: (value: Awaited<ReturnType<FlowApiService['dashboardAnalytics']>>) => void = () => undefined;
    const api = createApi();
    (api.dashboardAnalytics as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce({
        openTasks: 2,
        cycleTime: { p50Seconds: 12, p95Seconds: 22 },
        completionRate: { last7Days: 0.125, last30Days: 0.875 },
        slaBreaches: 1,
      });
    const component = createWithApi(api, () => new StynxFlowDashboardComponent());
    component.scopeId = 'scope-1';
    component.scopeCode = 'scope';
    component.graphId = 'graph-1';

    const first = component.load();
    const second = component.load();
    await second;
    resolveFirst({
      openTasks: 99,
      cycleTime: { p50Seconds: 99, p95Seconds: 199 },
      completionRate: { last7Days: 0.99, last30Days: 0.99 },
      slaBreaches: 99,
    });
    await first;

    expect(api.dashboardAnalytics).toHaveBeenNthCalledWith(1, {
      scopeId: 'scope-1',
      scopeCode: 'scope',
      graphId: 'graph-1',
    });
    expect(component.metrics()).toEqual(expect.objectContaining({ openTasks: 2, slaBreaches: 1 }));
    expect(component.percent(0.875)).toBe('88%');

    (api.dashboardAnalytics as ReturnType<typeof vi.fn>).mockRejectedValueOnce('offline');
    await component.load();
    expect(component.errorMessage()).toBe('Dashboard analytics load failed');
    expect(component.loading()).toBe(false);
  });

  it('loads dashboard analytics with empty filters when inputs are unset', async () => {
    const api = createApi();
    const component = createWithApi(api, () => new StynxFlowDashboardComponent());

    expect(component.metrics()).toBe(undefined);
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBe('');
    await component.ngOnChanges();

    expect(api.dashboardAnalytics).toHaveBeenCalledWith({});
    expect(component.metrics()).toEqual({
      openTasks: 8,
      cycleTime: { p50Seconds: 42, p95Seconds: 95 },
      completionRate: { last7Days: 0.25, last30Days: 0.8 },
      slaBreaches: 3,
    });
    expect(component.percent(0.125)).toBe('13%');
  });

  it('loads run activity pages, appends older events, and clears when no run is selected', async () => {
    const api = createApi();
    (api.listRunActivity as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ data: [{ id: 'event-1', runId: 'run-1', kind: 'started' }], meta: { page: 1, pageSize: 1, total: 2 } })
      .mockResolvedValueOnce({ data: [{ id: 'event-2', runId: 'run-1', kind: 'approved' }], meta: { page: 2, pageSize: 1, total: 2 } });
    const component = createWithApi(api, () => new StynxFlowRunActivityComponent());
    component.runId = 'run-1';
    component.pageSize = 1;

    await component.ngOnChanges();
    expect(component.events()).toEqual([expect.objectContaining({ id: 'event-1' })]);
    expect(component.hasNextPage()).toBe(true);

    await component.loadNextPage();
    expect(api.listRunActivity).toHaveBeenLastCalledWith('run-1', { page: 2, pageSize: 1 });
    expect(component.events()).toEqual([
      expect.objectContaining({ id: 'event-1' }),
      expect.objectContaining({ id: 'event-2' }),
    ]);
    expect(component.hasNextPage()).toBe(false);

    component.runId = '';
    await component.ngOnChanges();
    expect(component.events()).toEqual([]);
    expect(component.hasNextPage()).toBe(false);

    component.runId = 'run-1';
    (api.listRunActivity as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('activity down'));
    await component.refresh();
    expect(component.errorMessage()).toBe('activity down');
    expect(component.loading()).toBe(false);
  });

  it('ignores stale run activity refreshes and uses page math for next-page state', async () => {
    let resolveFirst: (value: Awaited<ReturnType<FlowApiService['listRunActivity']>>) => void = () => undefined;
    const api = createApi();
    (api.listRunActivity as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce({
        data: [{ id: 'event-latest', runId: 'run-1', kind: 'approved' }],
        meta: { page: 2, pageSize: 10, total: 20 },
      });
    const component = createWithApi(api, () => new StynxFlowRunActivityComponent());
    component.runId = 'run-1';
    component.pageSize = 10;

    const first = component.refresh();
    const second = component.loadNextPage();
    await second;
    resolveFirst({
      data: [{ id: 'event-stale', runId: 'run-1', kind: 'started' }],
      meta: { page: 1, pageSize: 10, total: 30 },
    });
    await first;

    expect(api.listRunActivity).toHaveBeenNthCalledWith(1, 'run-1', { page: 1, pageSize: 10 });
    expect(api.listRunActivity).toHaveBeenNthCalledWith(2, 'run-1', { page: 2, pageSize: 10 });
    expect(component.events()).toEqual([{ id: 'event-latest', runId: 'run-1', kind: 'approved' }]);
    expect(component.hasNextPage()).toBe(false);
    expect(component.loading()).toBe(false);
  });

  it('handles file answers, signatures, and reveal conditions in the fill editor', () => {
    const component = new StynxFlowFillEditorComponent();
    const emitted: unknown[] = [];
    component.answer.subscribe((value) => emitted.push(value));
    component.questions = [
      { id: 'approved', formId: 'form-1', key: 'approved', label: 'Approved', fieldType: 'boolean', required: false, blocksSubmit: false },
      { id: 'comment', formId: 'form-1', key: 'comment', label: 'Comment', fieldType: 'text', required: false, blocksSubmit: false, validators: { mode: 'long', maxLength: 8000 } },
      { id: 'attachment', formId: 'form-1', key: 'attachment', label: 'Attachment', fieldType: 'file', required: false, blocksSubmit: false, options: { collection: 'flow-attachments' }, revealIf: { question: 'approved', equals: true } },
      { id: 'signature', formId: 'form-1', key: 'signature', label: 'Signature', fieldType: 'signature', required: false, blocksSubmit: false, visibleIf: { key: 'approved', value: true } },
      { id: 'hidden', formId: 'form-1', key: 'hidden', label: 'Hidden', fieldType: 'text', required: false, blocksSubmit: false, revealIf: { question: 'missing', equals: 'yes' } },
    ];
    component.answers = [{ id: 'answer-approved', fillId: 'fill-1', questionId: 'approved', value: true }];

    expect(component.isQuestionVisible(component.questions[2]!)).toBe(true);
    expect(component.isQuestionVisible(component.questions[3]!)).toBe(true);
    expect(component.isQuestionVisible(component.questions[4]!)).toBe(false);
    expect(component.isLongText(component.questions[1]!)).toBe(true);
    expect(component.questionTextMaxLength(component.questions[1]!)).toBe(4000);
    expect(component.fileCollection(component.questions[2]!)).toBe('flow-attachments');

    component.setFileAnswer(component.questions[2]!, { id: 'document-1', documentId: 'document-1' } as never);
    expect(component.textValue(component.questions[2]!)).toBe('document-1');

    const canvas = document.createElement('canvas');
    const context = {
      beginPath: vi.fn(),
      clearRect: vi.fn(),
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      stroke: vi.fn(),
      lineWidth: 0,
      lineCap: '',
      strokeStyle: '',
    };
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as never);
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 20, width: 100, height: 50 } as DOMRect);
    vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,signature');

    component.beginSignature(component.questions[3]!, { target: canvas, clientX: 20, clientY: 30, preventDefault: vi.fn() } as never);
    component.drawSignature(component.questions[3]!, { target: canvas, clientX: 40, clientY: 35, preventDefault: vi.fn() } as never);
    component.endSignature(component.questions[3]!, { target: canvas, preventDefault: vi.fn() } as never);

    expect(context.beginPath).toHaveBeenCalledTimes(1);
    expect(context.lineTo).toHaveBeenCalledWith(90, 45);
    expect(component.textValue(component.questions[3]!)).toBe('data:image/png;base64,signature');

    const shell = document.createElement('div');
    shell.className = 'signature';
    const clearButton = document.createElement('button');
    shell.append(canvas, clearButton);
    component.clearSignature(component.questions[3]!, { target: clearButton } as never);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    expect(component.textValue(component.questions[3]!)).toBe('');

    component.saveAllAnswers();
    expect(emitted).toEqual(expect.arrayContaining([
      { questionId: 'attachment', value: 'document-1' },
      { questionId: 'signature', value: 'data:image/png;base64,signature' },
      { questionId: 'signature', value: null },
    ]));
  });

  it('wires provideStynxFlow for instance-backed and factory-backed package hosts', () => {
    const instanceClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideStynxFlow(instanceClient)],
    });
    expect(TestBed.inject(STYNX_FLOW_CLIENT)).toBe(instanceClient);
    TestBed.resetTestingModule();

    const tenantChanged$ = new Subject<void>();
    const factoryClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() };
    const clientFactory = vi.fn(() => factoryClient);
    TestBed.configureTestingModule({
      providers: [provideStynxFlow({ clientFactory, tenantChanged$ })],
    });

    expect(TestBed.inject(STYNX_FLOW_CLIENT)).toBe(factoryClient);
    expect(clientFactory).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(STYNX_FLOW_TENANT_CHANGED)).toBe(tenantChanged$);
  });
});
