import '@angular/compiler';
import { jest } from '@jest/globals';
import { StynxFlowOpenTasksComponent } from '../src/analytics.component';
import { StynxFlowFillEditorComponent } from '../src/flow-fills.component';
import { StynxFlowGraphCanvasComponent } from '../src/flow-graph-canvas.component';
import { StynxFlowGraphDesignerComponent } from '../src/flow-graph-designer.component';
import { StynxFlowTaskCardComponent } from '../src/flow-tasks.component';
import type { FlowApiService } from '../src/flow-api.service';

function createApi(): FlowApiService {
  return {
    listScopes: jest.fn(async () => [{ id: 'scope-1', code: 'scope', label: 'Scope', adapterKey: 'test' }]),
    listGraphs: jest.fn(async () => [{ id: 'graph-1', scopeId: 'scope-1', code: 'approval', version: 'v1', isActive: true, name: 'Approval' }]),
    listGraphNodes: jest.fn(async () => [{ id: 'node-1', graphId: 'graph-1', code: 'review', kind: 'human', allowedActions: ['approve'] }]),
    listGraphEdges: jest.fn(async () => [{ id: 'edge-1', graphId: 'graph-1', fromNodeId: 'start', toNodeId: 'review' }]),
    openTasks: jest.fn(async () => ({ data: [{ id: 'task-1', runId: 'run-1', nodeRunId: 'nr-1', nodeId: 'node-1', assigneeType: 'user', status: 'open', allowedActions: ['approve'], targetType: 'generic', targetId: 'target-1' }], meta: { page: 1, pageSize: 50, total: 1 } })),
  } as unknown as FlowApiService;
}

describe('@stynx-web/angular-flow components', () => {
  it('binds graph designer inputs to route-like scope and graph ids', async () => {
    const api = createApi();
    const component = new StynxFlowGraphDesignerComponent(api);
    component.scopeId = 'scope-1';
    component.graphId = 'graph-1';

    await component.load();

    expect(api.listGraphs).toHaveBeenCalledWith('scope-1');
    expect(api.listGraphNodes).toHaveBeenCalledWith('graph-1');
    expect(component.activeScope?.code).toBe('scope');
    expect(component.activeGraph?.code).toBe('approval');
    expect(component.nodes).toHaveLength(1);
    expect(component.edges).toHaveLength(1);
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');
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
    const component = new StynxFlowOpenTasksComponent(api);

    await component.load();

    expect(component.tasks).toEqual([expect.objectContaining({ id: 'task-1', targetId: 'target-1' })]);
    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBe('');
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

    component.setValue(component.questions[0]!, false);
    component.saveAllAnswers();
    component.waiveQuestion.emit(component.questions[0]!);

    expect(component.answerFor('question-1')?.value).toBe(true);
    expect(answers).toEqual([{ questionId: 'question-1', value: false }]);
    expect(saved).toEqual([[{ questionId: 'question-1', value: false }]]);
    expect(waivers).toEqual([component.questions[0]]);
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
    component.saveAllAnswers();

    expect(saved).toEqual([[
      { questionId: 'number-question', value: 8 },
      { questionId: 'select-question', value: 'a' },
      { questionId: 'multi-question', value: ['a', 'b'] },
      { questionId: 'date-question', value: '2026-05-17' },
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
});
