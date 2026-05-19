import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { StynxFlowOpenTasksComponent, StynxFlowRunSummaryComponent } from '../src/analytics.component';
import {
  StynxFlowFillEditorComponent,
  StynxFlowFillsComponent,
} from '../src/flow-fills.component';
import { FlowApiService } from '../src/flow-api.service';
import {
  StynxFlowFormEditorComponent,
  StynxFlowFormsComponent,
  StynxFlowQuestionScoreComponent,
} from '../src/flow-forms.component';
import { StynxFlowGraphCanvasComponent } from '../src/flow-graph-canvas.component';
import { StynxFlowGraphDesignerComponent } from '../src/flow-graph-designer.component';
import {
  StynxFlowTaskAssignmentDialogComponent,
  StynxFlowTaskCardComponent,
  StynxFlowTaskListComponent,
} from '../src/flow-tasks.component';
import {
  StynxFlowWaiverDialogComponent,
  StynxFlowWaiversComponent,
} from '../src/flow-waivers.component';
import { STYNX_FLOW_CLIENT } from '../src/tokens';
import type { Mock } from 'vitest';

function createApi(): FlowApiService {
  return {
    listScopes: vi.fn(async () => [{ id: 'scope-1', code: 'scope', label: 'Scope', adapterKey: 'test' }]),
    listGraphs: vi.fn(async () => [{ id: 'graph-1', scopeId: 'scope-1', code: 'approval', version: 'v1', isActive: true, name: 'Approval' }]),
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

describe('@stynx-web/angular-flow components', () => {
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
    expect(component.nodes).toHaveLength(1);
    expect(component.edges).toHaveLength(1);
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');

    (api.listScopes as Mock).mockRejectedValueOnce('offline');
    await component.load();
    expect(component.errorMessage).toBe('Flow graph load failed');
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
    assignment.cancel.subscribe(() => emitted.push('assignment-cancel'));
    waiverDialog.save.subscribe((value) => emitted.push(value));
    waiverDialog.cancel.subscribe(() => emitted.push('waiver-cancel'));

    formEditor.save.emit(formEditor.form || {});
    score.save.emit(score.score || {});
    assignment.userId = 'user-1';
    assignment.assign.emit(assignment.userId);
    assignment.cancel.emit();
    waiverDialog.save.emit(waiverDialog.waiver || {});
    waiverDialog.cancel.emit();

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
});
