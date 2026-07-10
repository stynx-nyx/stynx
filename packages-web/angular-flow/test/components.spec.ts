import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { StynxFlowOpenTasksComponent, StynxFlowRunSummaryComponent } from '../src/analytics.component';
import {
  StynxFlowFillEditorComponent,
  StynxFlowFillsComponent,
} from '../src/flow-fills.component';
import { FlowApiService } from '../src/flow-api.service';
import {
  StynxFlowAgentRuleDialogComponent,
  StynxFlowEdgeDialogComponent,
  StynxFlowGraphDialogComponent,
  StynxFlowNodeDialogComponent,
  StynxFlowNodeFormRuleDialogComponent,
  StynxFlowTransitionEffectDialogComponent,
} from '../src/flow-design-dialogs.component';
import { StynxFlowEmptyStateComponent } from '../src/flow-empty-state.component';
import {
  StynxFlowFormEditorComponent,
  StynxFlowFormsComponent,
  StynxFlowQuestionScoreComponent,
} from '../src/flow-forms.component';
import { StynxFlowGraphCanvasComponent } from '../src/flow-graph-canvas.component';
import { StynxFlowGraphDesignerComponent } from '../src/flow-graph-designer.component';
import {
  StynxFlowMyTasksInboxComponent,
  StynxFlowTaskAssignmentDialogComponent,
  StynxFlowTaskCardComponent,
  StynxFlowTaskListComponent,
} from '../src/flow-tasks.component';
import {
  StynxFlowWaiverDialogComponent,
  StynxFlowWaiversComponent,
} from '../src/flow-waivers.component';
import { STYNX_FLOW_CLIENT, STYNX_FLOW_TENANT_CHANGED } from '../src/tokens';
import type { Mock } from 'vitest';
import { Subject } from 'rxjs';

function createApi(): FlowApiService {
  return {
    listScopes: vi.fn(async () => [{ id: 'scope-1', code: 'scope', label: 'Scope', adapterKey: 'test' }]),
    listGraphs: vi.fn(async () => [{ id: 'graph-1', scopeId: 'scope-1', code: 'approval', version: 'v1', status: 'draft', isActive: true, name: 'Approval' }]),
    publishGraph: vi.fn(async () => ({
      graphId: 'graph-1',
      status: 'published',
      draftVersion: 'v1',
      publishedVersion: 1,
      publishedAt: '2026-05-19T00:00:00.000Z',
      publishedBy: 'user-1',
      runtimeGraphRef: { graphId: 'graph-1', version: 1 },
    })),
    listGraphNodes: vi.fn(async () => [{ id: 'node-1', graphId: 'graph-1', code: 'review', kind: 'human', allowedActions: ['approve'] }]),
    listGraphEdges: vi.fn(async () => [{ id: 'edge-1', graphId: 'graph-1', fromNodeId: 'start', toNodeId: 'review' }]),
    openTasks: vi.fn(async () => ({ data: [{ id: 'task-1', runId: 'run-1', nodeRunId: 'nr-1', nodeId: 'node-1', assigneeType: 'user', status: 'open', allowedActions: ['approve'], targetType: 'generic', targetId: 'target-1' }], meta: { page: 1, pageSize: 50, total: 1 } })),
    runsSummary: vi.fn(async () => ({ data: [{ scopeId: 'scope-1', graphId: 'graph-1', status: 'active', runCount: 2 }], meta: { page: 1, pageSize: 50, total: 1 } })),
    listForms: vi.fn(async () => [{ id: 'form-1', scopeId: 'scope-1', code: 'form', title: 'Form', version: 'v1' }]),
    listFills: vi.fn(async () => [{ id: 'fill-1', formId: 'form-1', targetType: 'record', targetId: 'record-1', status: 'draft' }]),
    listTasks: vi.fn(async () => ({ data: [{ id: 'task-1', runId: 'run-1', nodeRunId: 'nr-1', nodeId: 'node-1', assigneeType: 'user', status: 'open', allowedActions: ['approve'] }], meta: { page: 1, pageSize: 50, total: 1 } })),
    listWaivers: vi.fn(async () => [{ id: 'waiver-1', fillId: 'fill-1', targetType: 'question', targetId: 'q-1', reason: 'Manual' }]),
  } as unknown as FlowApiService;
}

function createFlowApi(client: unknown): FlowApiService {
  const injector = Injector.create({
    providers: [{ provide: STYNX_FLOW_CLIENT, useValue: client }],
  });
  return runInInjectionContext(injector, () => new FlowApiService());
}

function createWithApi<T>(api: FlowApiService, factory: () => T): T {
  const injector = Injector.create({
    providers: [{ provide: FlowApiService, useValue: api }],
  });
  return runInInjectionContext(injector, factory);
}

function createInbox(api: FlowApiService, tenantChanged: Subject<void>): StynxFlowMyTasksInboxComponent {
  const injector = Injector.create({
    providers: [
      { provide: FlowApiService, useValue: api },
      { provide: STYNX_FLOW_TENANT_CHANGED, useValue: tenantChanged.asObservable() },
    ],
  });
  return runInInjectionContext(injector, () => new StynxFlowMyTasksInboxComponent());
}

describe('@stynx-nyx/angular-flow components', () => {
  it('binds graph designer inputs to route-like scope and graph ids', async () => {
    const api = createApi();
    const component = createWithApi(api, () => new StynxFlowGraphDesignerComponent());
    component.scopeId = 'scope-1';
    component.graphId = 'graph-1';

    await component.ngOnChanges();
    expect(component.nodes).toHaveLength(1);
    await component.load();

    expect(api.listGraphs).toHaveBeenCalledWith('scope-1');
    expect(api.listGraphNodes).toHaveBeenCalledWith('graph-1');
    expect(component.activeScope?.code).toBe('scope');
    expect(component.activeGraph?.code).toBe('approval');
    expect(component.graphStatusLabel(component.activeGraph!)).toBe('flow.graphDesigner.status.draft');
    expect(component.nodes).toHaveLength(1);
    expect(component.edges).toHaveLength(1);
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');

    (api.listScopes as Mock).mockRejectedValueOnce('offline');
    await component.load();
    expect(component.errorMessage).toBe('Flow graph load failed');
  });

  it('publishes the active draft graph through the Flow API contract', async () => {
    const api = createApi();
    const component = createWithApi(api, () => new StynxFlowGraphDesignerComponent());
    component.scopeId = 'scope-1';
    component.graphId = 'graph-1';

    await component.load();
    await component.publishActiveGraph();

    expect(api.publishGraph).toHaveBeenCalledWith('graph-1', { expectedDraftVersion: 'v1' });
    expect(api.listGraphs).toHaveBeenCalledTimes(2);
    expect(component.publishingGraphId).toBe('');
    expect(component.errorMessage).toBe('');
  });

  it('surfaces publish failures and labels published versions', async () => {
    const api = createApi();
    (api.listGraphs as Mock).mockResolvedValueOnce([{
      id: 'graph-1',
      scopeId: 'scope-1',
      code: 'approval',
      version: 'v1',
      status: 'published',
      publishedVersion: 3,
      isActive: true,
    }]);
    const component = createWithApi(api, () => new StynxFlowGraphDesignerComponent());
    component.scopeId = 'scope-1';
    component.graphId = 'graph-1';

    await component.load();
    expect(component.graphStatusLabel(component.activeGraph!)).toBe('flow.graphDesigner.status.published');

    (api.publishGraph as Mock).mockRejectedValueOnce(new Error('publish rejected'));
    await component.publishActiveGraph();
    expect(component.errorMessage).toBe('publish rejected');
  });

  it('surfaces the first-run scope empty state intent', async () => {
    const api = createApi();
    (api.listScopes as Mock).mockResolvedValueOnce([]);
    const component = createWithApi(api, () => new StynxFlowGraphDesignerComponent());
    const emitted: unknown[] = [];
    component.createScope.subscribe(() => emitted.push('scope'));

    await component.load();
    component.createScope.emit();

    expect(component.hasNoScopes).toBe(true);
    expect(component.hasNoGraphsForActiveScope).toBe(false);
    expect(component.nodes).toEqual([]);
    expect(component.edges).toEqual([]);
    expect(api.listGraphs).not.toHaveBeenCalledTimes(1);
    expect(emitted).toEqual(['scope']);
  });

  it('surfaces the active-scope empty graph intent without stale canvas data', async () => {
    const api = createApi();
    (api.listGraphs as Mock).mockResolvedValueOnce([]);
    const component = createWithApi(api, () => new StynxFlowGraphDesignerComponent());
    const emitted: unknown[] = [];
    component.scopeId = 'scope-1';
    component.createGraph.subscribe((value) => emitted.push(value));

    await component.load();
    component.createGraph.emit(component.activeScope);

    expect(component.hasNoScopes).toBe(false);
    expect(component.hasNoGraphsForActiveScope).toBe(true);
    expect(component.nodes).toEqual([]);
    expect(component.edges).toEqual([]);
    expect(api.listGraphNodes).not.toHaveBeenCalledTimes(1);
    expect(api.listGraphEdges).not.toHaveBeenCalledTimes(1);
    expect(emitted).toEqual([expect.objectContaining({ id: 'scope-1' })]);
  });

  it('keeps the empty state action output host-controlled', () => {
    const component = new StynxFlowEmptyStateComponent();
    const emitted: string[] = [];
    component.heading = 'No flow scopes yet';
    component.actionLabel = 'Create your first scope';
    component.action.subscribe(() => emitted.push(component.actionLabel));

    component.action.emit();

    expect(component.heading).toBe('No flow scopes yet');
    expect(emitted).toEqual(['Create your first scope']);
  });

  it('renders graph canvas selection outputs without mutating layout inputs', () => {
    const component = new StynxFlowGraphCanvasComponent();
    const node = { id: 'node-1', graphId: 'graph-1', code: 'review', kind: 'human' as const };
    const edge = { id: 'edge-1', graphId: 'graph-1', fromNodeId: 'start', toNodeId: 'review' };
    const selectedNodes: unknown[] = [];
    const selectedEdges: unknown[] = [];
    component.nodes = [node];
    component.edges = [edge];
    component.nodeSelected.subscribe((value) => selectedNodes.push(value));
    component.edgeSelected.subscribe((value) => selectedEdges.push(value));

    component.nodeSelected.emit(node);
    component.edgeSelected.emit(edge);

    expect(selectedNodes).toEqual([node]);
    expect(selectedEdges).toEqual([edge]);
    expect(component.nodes).toEqual([node]);
    expect(component.edges).toEqual([edge]);
  });

  it('loads paged open-task analytics envelopes', async () => {
    const api = createApi();
    const component = createWithApi(api, () => new StynxFlowOpenTasksComponent());

    expect(component.tasks).toEqual([]);
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');
    await component.ngOnInit();
    expect(component.tasks).toHaveLength(1);
    await component.load();

    expect(component.tasks).toEqual([expect.objectContaining({ id: 'task-1', targetId: 'target-1' })]);
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');
  });

  it('omits query options when API filters are absent', async () => {
    const client = {
      get: vi.fn(async () => ({ data: [], meta: { page: 1, pageSize: 50, total: 0 } })),
    };
    const api = createFlowApi(client);

    await api.openTasks();

    expect(client.get).toHaveBeenCalledWith('/flow/open-tasks', {});
  });

  it('captures analytics load failures from Error and non-Error throwables', async () => {
    const api = createApi();
    const tasks = createWithApi(api, () => new StynxFlowOpenTasksComponent());
    (api.openTasks as Mock).mockRejectedValueOnce(new Error('open tasks down'));
    await tasks.load();
    expect(tasks.errorMessage).toBe('open tasks down');

    (api.openTasks as Mock).mockRejectedValueOnce('offline');
    await tasks.load();
    expect(tasks.errorMessage).toBe('Open tasks load failed');
  });

  it('loads run summaries and captures non-Error failures', async () => {
    const api = createApi();
    const component = createWithApi(api, () => new StynxFlowRunSummaryComponent());

    expect(component.summaries).toEqual([]);
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');
    await component.ngOnInit();
    expect(component.summaries).toHaveLength(1);
    await component.load();
    expect(component.summaries).toEqual([expect.objectContaining({ status: 'active', runCount: 2 })]);

    (api.runsSummary as Mock).mockRejectedValueOnce(new Error('summary down'));
    await component.load();
    expect(component.errorMessage).toBe('summary down');

    (api.runsSummary as Mock).mockRejectedValueOnce('offline');
    await component.load();
    expect(component.errorMessage).toBe('Run summary load failed');
    expect(component.loading).toBe(false);
  });

  it('loads forms, fills, tasks, and waivers with optional filters and error branches', async () => {
    const api = createApi();
    const forms = createWithApi(api, () => new StynxFlowFormsComponent());
    forms.scopeId = 'scope-1';
    await forms.ngOnChanges();
    expect(forms.forms).toHaveLength(1);
    await forms.load();
    expect(api.listForms).toHaveBeenCalledWith('scope-1');
    (api.listForms as Mock).mockRejectedValueOnce(new Error('forms down'));
    await forms.load();
    expect(forms.errorMessage).toBe('forms down');

    const fills = createWithApi(api, () => new StynxFlowFillsComponent());
    fills.formId = 'form-1';
    fills.targetType = 'record';
    fills.targetId = 'record-1';
    await fills.ngOnChanges();
    expect(fills.fills).toHaveLength(1);
    await fills.load();
    expect(api.listFills).toHaveBeenCalledWith({
      formId: 'form-1',
      targetType: 'record',
      targetId: 'record-1',
    });
    (api.listFills as Mock).mockRejectedValueOnce('bad');
    await fills.load();
    expect(fills.errorMessage).toBe('Fills load failed');
    fills.formId = '';
    fills.targetType = '';
    fills.targetId = '';
    await fills.load();
    expect(api.listFills).toHaveBeenLastCalledWith({});

    const tasks = createWithApi(api, () => new StynxFlowTaskListComponent());
    tasks.mine = true;
    tasks.status = 'assigned';
    await tasks.ngOnChanges();
    expect(tasks.tasks).toHaveLength(1);
    await tasks.load();
    expect(api.listTasks).toHaveBeenCalledWith({ mine: true, status: 'assigned' });
    (api.listTasks as Mock).mockRejectedValueOnce(new Error('tasks down'));
    await tasks.load();
    expect(tasks.errorMessage).toBe('tasks down');

    const waivers = createWithApi(api, () => new StynxFlowWaiversComponent());
    waivers.scopeId = 'scope-1';
    waivers.targetType = 'question';
    waivers.targetId = 'q-1';
    await waivers.ngOnChanges();
    expect(waivers.waivers).toHaveLength(1);
    await waivers.load();
    expect(api.listWaivers).toHaveBeenCalledWith({
      scopeId: 'scope-1',
      targetType: 'question',
      targetId: 'q-1',
    });
    (api.listWaivers as Mock).mockRejectedValueOnce('bad');
    await waivers.load();
    expect(waivers.errorMessage).toBe('Waivers load failed');
    waivers.scopeId = '';
    waivers.targetType = '';
    waivers.targetId = '';
    await waivers.load();
    expect(api.listWaivers).toHaveBeenLastCalledWith({});
  });

  it('describes branch: distinguishes empty filters and fallback load errors across flow lists', async () => {
    const api = createApi();
    const forms = createWithApi(api, () => new StynxFlowFormsComponent());
    await forms.load();
    expect(api.listForms).toHaveBeenLastCalledWith(undefined);

    (api.listForms as Mock).mockRejectedValueOnce('offline');
    await forms.load();
    expect(forms.errorMessage).toBe('Forms load failed');

    const fills = createWithApi(api, () => new StynxFlowFillsComponent());
    (api.listFills as Mock).mockRejectedValueOnce(new Error('fills down'));
    await fills.load();
    expect(fills.errorMessage).toBe('fills down');

    const graph = createWithApi(api, () => new StynxFlowGraphDesignerComponent());
    (api.listScopes as Mock).mockRejectedValueOnce(new Error('graph down'));
    await graph.load();
    expect(graph.errorMessage).toBe('graph down');

    const tasks = createWithApi(api, () => new StynxFlowTaskListComponent());
    (api.listTasks as Mock).mockRejectedValueOnce('offline');
    await tasks.load();
    expect(tasks.errorMessage).toBe('Tasks load failed');

    const waivers = createWithApi(api, () => new StynxFlowWaiversComponent());
    (api.listWaivers as Mock).mockRejectedValueOnce(new Error('waivers down'));
    await waivers.load();
    expect(waivers.errorMessage).toBe('waivers down');
  });

  it('loads the my-tasks inbox with signal state and tenant refreshes', async () => {
    const api = createApi();
    const tenantChanged = new Subject<void>();
    const component = createInbox(api, tenantChanged);
    const actions: unknown[] = [];
    const assignments: unknown[] = [];
    component.pollingIntervalMs = 0;
    component.act.subscribe((value) => actions.push(value));
    component.assign.subscribe((value) => assignments.push(value));

    await component.refresh();
    expect(api.listTasks).toHaveBeenCalledWith({ assignee: 'me', status: 'open' });
    expect(component.tasks()).toHaveLength(1);
    expect(component.loading()).toBe(false);
    expect(component.errorMessage()).toBe('');

    component.act.emit({ task: component.tasks()[0]!, action: 'approve' });
    component.assign.emit(component.tasks()[0]!);
    expect(actions).toEqual([{ task: component.tasks()[0], action: 'approve' }]);
    expect(assignments).toEqual([component.tasks()[0]]);

    (api.listTasks as Mock).mockClear();
    component.ngOnInit();
    await Promise.resolve();
    (api.listTasks as Mock).mockClear();
    tenantChanged.next();
    await Promise.resolve();
    expect(api.listTasks).toHaveBeenCalledWith({ assignee: 'me', status: 'open' });
  });

  it('normalizes my-tasks polling input and captures fallback load errors', async () => {
    const api = createApi();
    const component = createWithApi(api, () => new StynxFlowMyTasksInboxComponent());

    component.pollingIntervalMs = '1500';
    expect(component.pollingIntervalMs).toBe(1500);
    component.pollingIntervalMs = -1;
    expect(component.pollingIntervalMs).toBe(0);
    component.pollingIntervalMs = 'not-a-number';
    expect(component.pollingIntervalMs).toBe(30000);

    (api.listTasks as Mock).mockRejectedValueOnce('offline');
    await component.refresh();
    expect(component.errorMessage()).toBe('My tasks load failed');
    expect(component.loading()).toBe(false);
  });

  it('supports fill editor answer lookup and bulk save intent', () => {
    const component = new StynxFlowFillEditorComponent();
    const saved: unknown[] = [];
    const answers: unknown[] = [];
    const waivers: unknown[] = [];
    component.questions = [{ id: 'question-1', formId: 'form-1', key: 'approved', label: 'Approved', fieldType: 'boolean', required: true, blocksSubmit: false }];
    component.answers = [{ id: 'answer-1', fillId: 'fill-1', questionId: 'question-1', value: true }];
    component.answer.subscribe((value) => answers.push(value));
    component.saveAnswers.subscribe((value) => saved.push(value));
    component.waiveQuestion.subscribe((value) => waivers.push(value));

    component.ngOnChanges();
    component.setValue(component.questions[0]!, false);
    component.saveAllAnswers();
    component.waiveQuestion.emit(component.questions[0]!);

    expect(component.answerFor('question-1')?.value).toBe(true);
    expect(answers).toEqual([{ questionId: 'question-1', value: false }]);
    expect(saved).toEqual([[{ questionId: 'question-1', value: false }]]);
    expect(waivers).toEqual([component.questions[0]]);
  });

  it('covers form and dialog event defaults', () => {
    const formEditor = new StynxFlowFormEditorComponent();
    const score = new StynxFlowQuestionScoreComponent();
    const assignment = new StynxFlowTaskAssignmentDialogComponent();
    const waiverDialog = new StynxFlowWaiverDialogComponent();
    const emitted: unknown[] = [];
    formEditor.save.subscribe((value) => emitted.push(value));
    score.save.subscribe((value) => emitted.push(value));
    assignment.assign.subscribe((value) => emitted.push(value));
    assignment.dismissed.subscribe(() => emitted.push('assignment-cancel'));
    waiverDialog.save.subscribe((value) => emitted.push(value));
    waiverDialog.dismissed.subscribe(() => emitted.push('waiver-cancel'));

    formEditor.save.emit(formEditor.form || {});
    score.save.emit(score.score || {});
    assignment.userId = 'user-1';
    assignment.assign.emit(assignment.userId);
    assignment.dismissed.emit();
    waiverDialog.save.emit(waiverDialog.waiver || {});
    waiverDialog.dismissed.emit();

    expect(emitted).toEqual([{}, {}, 'user-1', 'assignment-cancel', {}, 'waiver-cancel']);
  });

  it('normalizes typed fill editor values for package hosts', () => {
    const component = new StynxFlowFillEditorComponent();
    const saved: unknown[] = [];
    component.questions = [
      { id: 'number-question', formId: 'form-1', key: 'amount', label: 'Amount', fieldType: 'number', required: false, blocksSubmit: false },
      { id: 'select-question', formId: 'form-1', key: 'choice', label: 'Choice', fieldType: 'select', required: false, blocksSubmit: false, options: [{ label: 'Option A', value: 'a' }] },
      { id: 'multi-question', formId: 'form-1', key: 'tags', label: 'Tags', fieldType: 'multiselect', required: false, blocksSubmit: false, options: { a: 'Alpha', b: 'Beta' } },
      { id: 'date-question', formId: 'form-1', key: 'due', label: 'Due', fieldType: 'date', required: false, blocksSubmit: false },
    ];
    component.answers = [
      { id: 'answer-number', fillId: 'fill-1', questionId: 'number-question', value: '4' },
      { id: 'answer-multi', fillId: 'fill-1', questionId: 'multi-question', value: 'a' },
    ];
    component.saveAnswers.subscribe((value) => saved.push(value));

    expect(component.numberValue(component.questions[0]!)).toBe('4');
    expect(component.questionOptions(component.questions[1]!)).toEqual([{ label: 'Option A', value: 'a', key: 'a' }]);
    expect(component.questionOptions(component.questions[2]!)).toEqual([
      { label: 'Alpha', value: 'a', key: 'a' },
      { label: 'Beta', value: 'b', key: 'b' },
    ]);
    expect(component.isSelected(component.questions[2]!, 'a')).toBe(true);

    component.setValue(component.questions[0]!, '8');
    component.setValue(component.questions[1]!, component.optionValueFromKey(component.questions[1]!, 'a'));
    component.setValue(component.questions[2]!, ['a', 'b']);
    component.setValue(component.questions[3]!, '2026-05-17');
    component.setMultiselectValue(component.questions[2]!, {
      0: { value: 'a' },
      1: { value: 'b' },
      length: 2,
      item: (index: number) => [{ value: 'a' }, { value: 'b' }][index] ?? null,
    } as unknown as HTMLCollectionOf<HTMLOptionElement>);
    component.saveAllAnswers();

    expect(saved).toEqual([[
      { questionId: 'number-question', value: 8 },
      { questionId: 'select-question', value: 'a' },
      { questionId: 'multi-question', value: ['a', 'b'] },
      { questionId: 'date-question', value: '2026-05-17' },
    ]]);
  });

  it('serializes fill-editor boundary values and excludes hidden answers from bulk save', () => {
    const component = new StynxFlowFillEditorComponent();
    const saved: unknown[] = [];
    const emitted: unknown[] = [];
    component.questions = [
      { id: 'source', formId: 'form-1', key: 'source', label: 'Source', fieldType: 'select', required: false, blocksSubmit: false, options: [{ label: 'Yes', value: 'yes' }] },
      { id: 'visible', formId: 'form-1', key: 'visible', label: 'Visible', fieldType: 'number', required: false, blocksSubmit: false, visibleIf: { questionKey: 'source', value: 'yes' } },
      { id: 'hidden', formId: 'form-1', key: 'hidden', label: 'Hidden', fieldType: 'text', required: false, blocksSubmit: false, revealIf: { question: 'source', equals: 'no' } },
      { id: 'invalid-number', formId: 'form-1', key: 'invalidNumber', label: 'Invalid number', fieldType: 'number', required: false, blocksSubmit: false },
      { id: 'file', formId: 'form-1', key: 'file', label: 'File', fieldType: 'file', required: false, blocksSubmit: false },
      { id: 'signature', formId: 'form-1', key: 'signature', label: 'Signature', fieldType: 'signature', required: false, blocksSubmit: false },
      { id: 'long-default', formId: 'form-1', key: 'longDefault', label: 'Long default', fieldType: 'text', required: false, blocksSubmit: false, validators: { mode: 'long' } },
      { id: 'zero-max', formId: 'form-1', key: 'zeroMax', label: 'Zero max', fieldType: 'text', required: false, blocksSubmit: false, validators: { maxLength: 0 } },
    ];
    component.answers = [
      { id: 'source-answer', fillId: 'fill-1', questionId: 'source', value: 'yes' },
      { id: 'invalid-answer', fillId: 'fill-1', questionId: 'invalid-number', value: 'not-a-number' },
    ];
    component.saveAnswers.subscribe((value) => saved.push(value));
    component.answer.subscribe((value) => emitted.push(value));

    expect(component.isQuestionVisible(component.questions[1]!)).toBe(true);
    expect(component.isQuestionVisible(component.questions[2]!)).toBe(false);
    expect(component.numberValue(component.questions[3]!)).toBe('');
    expect(component.questionTextMaxLength(component.questions[6]!)).toBe(4000);
    expect(component.questionTextMaxLength(component.questions[7]!)).toBe(200);

    component.setValue(component.questions[1]!, undefined);
    component.setValue(component.questions[4]!, '');
    component.setValue(component.questions[5]!, '');
    component.saveAllAnswers();

    expect(emitted).toEqual([
      { questionId: 'visible', value: null },
      { questionId: 'file', value: null },
      { questionId: 'signature', value: null },
    ]);
    expect(saved).toEqual([[
      { questionId: 'source', value: 'yes' },
      { questionId: 'visible', value: null },
      { questionId: 'invalid-number', value: Number.NaN },
      { questionId: 'file', value: null },
      { questionId: 'signature', value: null },
      { questionId: 'long-default', value: null },
      { questionId: 'zero-max', value: null },
    ]]);
  });

  it('draws signature points with scaled canvas coordinates and stroke style', () => {
    const component = new StynxFlowFillEditorComponent();
    const question = { id: 'signature', formId: 'form-1', key: 'signature', label: 'Signature', fieldType: 'signature', required: false, blocksSubmit: false } as const;
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
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

    component.beginSignature(question, { target: canvas, clientX: 60, clientY: 45, preventDefault: vi.fn() } as never);
    component.drawSignature(question, { target: canvas, clientX: 85, clientY: 60, preventDefault: vi.fn() } as never);
    component.endSignature(question, { target: canvas, preventDefault: vi.fn() } as never);

    expect(context.lineWidth).toBe(2);
    expect(context.lineCap).toBe('round');
    expect(context.strokeStyle).toBe('#0f172a');
    expect(context.moveTo).toHaveBeenCalledWith(100, 50);
    expect(context.lineTo).toHaveBeenCalledWith(150, 80);
    expect(context.stroke).toHaveBeenCalledTimes(1);
    expect(component.textValue(question)).toBe('data:image/png;base64,signature');
  });

  it('covers fill editor empty, object option, and fallback serialization branches', () => {
    const component = new StynxFlowFillEditorComponent();
    const emitted: unknown[] = [];
    component.answer.subscribe((value) => emitted.push(value));
    component.questions = [
      { id: 'text-question', formId: 'form-1', key: 'text', label: 'Text', fieldType: 'text', required: false, blocksSubmit: false },
      { id: 'number-question', formId: 'form-1', key: 'amount', label: 'Amount', fieldType: 'number', required: false, blocksSubmit: false },
      { id: 'boolean-question', formId: 'form-1', key: 'ok', label: 'Ok', fieldType: 'boolean', required: false, blocksSubmit: false },
      { id: 'select-question', formId: 'form-1', key: 'choice', label: 'Choice', fieldType: 'select', required: false, blocksSubmit: false, options: [{ id: 'a', title: 'Option A' }, null] },
      { id: 'multi-question', formId: 'form-1', key: 'tags', label: 'Tags', fieldType: 'multiselect', required: false, blocksSubmit: false },
      { id: 'date-question', formId: 'form-1', key: 'due', label: 'Due', fieldType: 'date', required: false, blocksSubmit: false },
      { id: 'email-question', formId: 'form-1', key: 'email', label: 'Email', fieldType: 'email', required: false, blocksSubmit: false },
    ];
    component.answers = [
      { id: 'bool-answer', fillId: 'fill-1', questionId: 'boolean-question', value: 'true' },
      { id: 'number-empty-answer', fillId: 'fill-1', questionId: 'number-question', value: '' },
      { id: 'multi-array-answer', fillId: 'fill-1', questionId: 'multi-question', value: ['a'] },
      { id: 'date-answer', fillId: 'fill-1', questionId: 'date-question', value: '2026-05-18T12:00:00Z' },
    ];
    component.ngOnChanges();

    expect(component.textValue(component.questions[0]!)).toBe('');
    expect(component.numberValue(component.questions[1]!)).toBe('');
    expect(component.booleanValue(component.questions[2]!)).toBe(true);
    expect(component.isSelected(component.questions[4]!, 'a')).toBe(true);
    expect(component.dateValue(component.questions[5]!)).toBe('2026-05-18');
    expect(component.questionOptions(component.questions[3]!)[0]).toEqual({
      label: 'Option A',
      value: 'a',
      key: 'a',
    });
    expect(component.questionOptions({
      id: 'invalid-options',
      formId: 'form-1',
      key: 'invalid',
      label: 'Invalid',
      fieldType: 'select',
      required: false,
      blocksSubmit: false,
      options: 'not-options' as never,
    })).toEqual([]);
    expect(component.isSelected(component.questions[0]!, 'anything')).toBe(false);
    expect(component.optionValueFromKey(component.questions[3]!, 'missing')).toBe('missing');
    expect(component.optionKey({ a: 1 })).toBe(JSON.stringify({ a: 1 }));

    component.setValue(component.questions[0]!, '');
    component.setValue(component.questions[1]!, null);
    component.setValue(component.questions[2]!, 'true');
    component.setValue(component.questions[3]!, '');
    component.setValue(component.questions[4]!, 'not-array');
    component.setValue(component.questions[5]!, '');
    component.setValue(component.questions[6]!, 'ana@example.test');

    expect(emitted).toEqual([
      { questionId: 'text-question', value: null },
      { questionId: 'number-question', value: null },
      { questionId: 'boolean-question', value: true },
      { questionId: 'select-question', value: null },
      { questionId: 'multi-question', value: [] },
      { questionId: 'date-question', value: null },
      { questionId: 'email-question', value: 'ana@example.test' },
    ]);
  });

  it('describes branch: normalizes nullish persisted fill values and sparse option records', () => {
    const component = new StynxFlowFillEditorComponent();
    const saved: unknown[] = [];
    component.questions = [
      { id: 'text-null', formId: 'form-1', key: 'textNull', label: 'Text null', fieldType: 'text', required: false, blocksSubmit: false },
      { id: 'number-native', formId: 'form-1', key: 'count', label: 'Count', fieldType: 'number', required: false, blocksSubmit: false },
      { id: 'date-null', formId: 'form-1', key: 'dateNull', label: 'Date null', fieldType: 'date', required: false, blocksSubmit: false },
      { id: 'multi-null', formId: 'form-1', key: 'multiNull', label: 'Multi null', fieldType: 'multiselect', required: false, blocksSubmit: false },
      { id: 'multi-default', formId: 'form-1', key: 'multiDefault', label: 'Multi default', fieldType: 'multiselect', required: false, blocksSubmit: false },
    ];
    component.answers = [
      { id: 'text-null-answer', fillId: 'fill-1', questionId: 'text-null', value: null },
      { id: 'number-native-answer', fillId: 'fill-1', questionId: 'number-native', value: 7 },
      { id: 'date-null-answer', fillId: 'fill-1', questionId: 'date-null', value: null },
      { id: 'multi-null-answer', fillId: 'fill-1', questionId: 'multi-null', value: null },
    ];
    component.saveAnswers.subscribe((value) => saved.push(value));

    expect(component.textValue(component.questions[0]!)).toBe('');
    expect(component.numberValue(component.questions[1]!)).toBe('7');
    expect(component.dateValue(component.questions[2]!)).toBe('');
    expect(component.isSelected(component.questions[3]!, 'a')).toBe(false);
    expect(component.questionOptions(component.questions[4]!)).toEqual([]);
    expect(component.questionOptions({
      id: 'sparse-options',
      formId: 'form-1',
      key: 'sparse',
      label: 'Sparse',
      fieldType: 'select',
      required: false,
      blocksSubmit: false,
      options: { fallback: undefined },
    })).toEqual([{ label: 'fallback', value: 'fallback', key: 'fallback' }]);
    expect(component.questionOptions({
      id: 'object-options',
      formId: 'form-1',
      key: 'object',
      label: 'Object',
      fieldType: 'select',
      required: false,
      blocksSubmit: false,
      options: [{ value: 'value-only' }, { id: 'id-only' }, {}],
    })).toEqual([
      { label: 'value-only', value: 'value-only', key: 'value-only' },
      { label: 'id-only', value: 'id-only', key: 'id-only' },
      { label: '{}', value: {}, key: '{}' },
    ]);
    expect(component.optionKey(undefined)).toBe('');

    component.setValue(component.questions[0]!, undefined);
    component.setValue(component.questions[2]!, undefined);
    expect(component.textValue(component.questions[0]!)).toBe('');
    expect(component.dateValue(component.questions[2]!)).toBe('');
    component.setValue(component.questions[0]!, null);
    component.setValue(component.questions[2]!, null);

    component.saveAllAnswers();
    expect(saved).toEqual([[
      { questionId: 'text-null', value: null },
      { questionId: 'number-native', value: 7 },
      { questionId: 'date-null', value: null },
      { questionId: 'multi-null', value: [] },
      { questionId: 'multi-default', value: [] },
    ]]);
  });

  it('keeps task card action outputs permission-scoped by intent', () => {
    const component = new StynxFlowTaskCardComponent();
    const actions: string[] = [];
    const assigned: boolean[] = [];
    component.task = {
      id: 'task-1',
      runId: 'run-1',
      nodeRunId: 'node-run-1',
      nodeId: 'node-1',
      assigneeType: 'user',
      status: 'open',
      allowedActions: ['approve'],
    };
    component.act.subscribe((action) => actions.push(action));
    component.assign.subscribe(() => assigned.push(true));

    component.act.emit('approve');
    component.assign.emit();

    expect(component.mutationPermissions).toEqual({
      act: 'flow:execute:task',
      assign: 'flow:assign:task',
    });
    expect(actions).toEqual(['approve']);
    expect(assigned).toEqual([true]);
  });

  it('keeps fill reveal, text-mode, collection, and signature guard branches observable', () => {
    const component = new StynxFlowFillEditorComponent();
    component.questions = [
      { id: 'source-id', formId: 'form-1', key: 'sourceKey', label: 'Source', fieldType: 'select', required: false, blocksSubmit: false, options: [{ label: 'Approved', value: { code: 'APPROVED' } }] },
      { id: 'visible-by-id', formId: 'form-1', key: 'visibleById', label: 'By id', fieldType: 'text', required: false, blocksSubmit: false, revealIf: { question: 'source-id', equals: { code: 'APPROVED' } } },
      { id: 'visible-by-question-key', formId: 'form-1', key: 'visibleByQuestionKey', label: 'By question key', fieldType: 'text', required: false, blocksSubmit: false, visibleIf: { questionKey: 'sourceKey', value: { code: 'APPROVED' } } },
      { id: 'short-limited', formId: 'form-1', key: 'shortLimited', label: 'Short limited', fieldType: 'text', required: false, blocksSubmit: false, validators: { maxLength: 120 } },
      { id: 'short-overflow', formId: 'form-1', key: 'shortOverflow', label: 'Short overflow', fieldType: 'text', required: false, blocksSubmit: false, validators: { maxLength: 201 } },
      { id: 'long-option', formId: 'form-1', key: 'longOption', label: 'Long option', fieldType: 'text', required: false, blocksSubmit: false, options: { mode: 'long', collection: '' } },
      { id: 'file-default', formId: 'form-1', key: 'fileDefault', label: 'File default', fieldType: 'file', required: false, blocksSubmit: false, validators: { collection: '' } },
      { id: 'file-validator', formId: 'form-1', key: 'fileValidator', label: 'File validator', fieldType: 'file', required: false, blocksSubmit: false, validators: { collection: 'validator-docs' } },
      { id: 'signature', formId: 'form-1', key: 'signature', label: 'Signature', fieldType: 'signature', required: false, blocksSubmit: false },
    ];
    component.answers = [{ id: 'answer-source', fillId: 'fill-1', questionId: 'source-id', value: { code: 'APPROVED' } }];

    expect(component.isQuestionVisible(component.questions[1]!)).toBe(true);
    expect(component.isQuestionVisible(component.questions[2]!)).toBe(true);
    expect(component.isLongText(component.questions[3]!)).toBe(false);
    expect(component.questionTextMaxLength(component.questions[3]!)).toBe(120);
    expect(component.isLongText(component.questions[4]!)).toBe(true);
    expect(component.questionTextMaxLength(component.questions[5]!)).toBe(4000);
    expect(component.fileCollection(component.questions[6]!)).toBe('flow');
    expect(component.fileCollection(component.questions[7]!)).toBe('validator-docs');

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
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 50 } as DOMRect);
    const toDataURL = vi.spyOn(canvas, 'toDataURL').mockReturnValue('data:image/png;base64,signature');

    component.drawSignature(component.questions[8]!, { target: canvas, clientX: 1, clientY: 1, preventDefault: vi.fn() } as never);
    component.endSignature(component.questions[8]!, { target: canvas, preventDefault: vi.fn() } as never);
    expect(context.lineTo).not.toHaveBeenCalledTimes(1);
    expect(toDataURL).not.toHaveBeenCalledTimes(1);

    component.beginSignature(component.questions[8]!, { target: document.createElement('button'), clientX: 1, clientY: 1, preventDefault: vi.fn() } as never);
    component.endSignature(component.questions[8]!, { target: document.createElement('button'), preventDefault: vi.fn() } as never);
    expect(component.textValue(component.questions[8]!)).toBe('');
  });

  it('keeps flow design dialog defaults and output payloads observable', () => {
    const graph = new StynxFlowGraphDialogComponent();
    const node = new StynxFlowNodeDialogComponent();
    const edge = new StynxFlowEdgeDialogComponent();
    const agentRule = new StynxFlowAgentRuleDialogComponent();
    const formRule = new StynxFlowNodeFormRuleDialogComponent();
    const effect = new StynxFlowTransitionEffectDialogComponent();
    const emitted: unknown[] = [];

    for (const dialog of [graph, node, edge, agentRule, formRule, effect]) {
      expect(dialog.open).toBe(false);
      dialog.dismissed.subscribe(() => emitted.push('dismissed'));
      dialog.dismissed.emit();
    }
    graph.graph = { id: 'graph-1' };
    node.node = { id: 'node-1' };
    edge.edge = { id: 'edge-1' };
    agentRule.rule = { id: 'rule-1' };
    formRule.rule = { id: 'form-rule-1' };
    effect.effect = { id: 'effect-1' };
    graph.save.subscribe((value) => emitted.push(value));
    node.save.subscribe((value) => emitted.push(value));
    edge.save.subscribe((value) => emitted.push(value));
    agentRule.save.subscribe((value) => emitted.push(value));
    formRule.save.subscribe((value) => emitted.push(value));
    effect.save.subscribe((value) => emitted.push(value));

    graph.save.emit(graph.graph);
    node.save.emit(node.node);
    edge.save.emit(edge.edge);
    agentRule.save.emit(agentRule.rule);
    formRule.save.emit(formRule.rule);
    effect.save.emit(effect.effect);

    expect(emitted).toEqual([
      'dismissed',
      'dismissed',
      'dismissed',
      'dismissed',
      'dismissed',
      'dismissed',
      { id: 'graph-1' },
      { id: 'node-1' },
      { id: 'edge-1' },
      { id: 'rule-1' },
      { id: 'form-rule-1' },
      { id: 'effect-1' },
    ]);
  });
});
