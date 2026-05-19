import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { FlowApiService } from '../src/flow-api.service';
import { STYNX_FLOW_CLIENT } from '../src/tokens';

type Call = {
  method: string;
  path: string;
  body?: unknown;
  options?: unknown;
};

function createClient() {
  const calls: Call[] = [];
  const client = {
    calls,
    get: vi.fn(async (path: string, options?: unknown) => {
      calls.push({ method: 'GET', path, options });
      return path.includes('/summary') || path.includes('/open-tasks') || path === '/flow/tasks'
        ? { data: [], meta: { page: 1, pageSize: 50, total: 0 } }
        : [];
    }),
    post: vi.fn(async (path: string, body?: unknown, options?: unknown) => {
      calls.push({ method: 'POST', path, body, options });
      return {};
    }),
    put: vi.fn(async (path: string, body?: unknown, options?: unknown) => {
      calls.push({ method: 'PUT', path, body, options });
      return {};
    }),
    patch: vi.fn(async (path: string, body?: unknown, options?: unknown) => {
      calls.push({ method: 'PATCH', path, body, options });
      return {};
    }),
    delete: vi.fn(async (path: string, options?: unknown) => {
      calls.push({ method: 'DELETE', path, options });
      return {};
    }),
  };
  return client;
}

function createApi(client: unknown): FlowApiService {
  const injector = Injector.create({
    providers: [{ provide: STYNX_FLOW_CLIENT, useValue: client }],
  });
  return runInInjectionContext(injector, () => new FlowApiService());
}

describe('FlowApiService endpoint contract', () => {
  it('covers design route families for scopes, graphs, nodes, edges, rules, effects, and form gates', async () => {
    const client = createClient();
    const api = createApi(client);

    await api.listScopes();
    await api.getScope('scope-1');
    await api.createScope({ code: 'scope' });
    await api.updateScope('scope-1', { label: 'Scope' });
    await api.deleteScope('scope-1');
    await api.listGraphs('scope-1');
    await api.getGraph('graph-1');
    await api.createGraph({ scopeId: 'scope-1', code: 'approval' });
    await api.updateGraph('graph-1', { name: 'Approval' });
    await api.publishGraph('graph-1', { expectedDraftVersion: 'v1', notes: 'Release' }, 'publish-key');
    await api.deleteGraph('graph-1');
    await api.exportGraph('graph-1');
    await api.importGraph({ graph: { code: 'approval' }, nodes: [] });
    await api.listGraphNodes('graph-1');
    await api.createGraphNode('graph-1', { code: 'review' });
    await api.updateNode('node-1', { name: 'Review' });
    await api.deleteNode('node-1');
    await api.listGraphEdges('graph-1');
    await api.createGraphEdge('graph-1', { fromNodeId: 'start', toNodeId: 'review' });
    await api.updateEdge('edge-1', { action: 'approve' });
    await api.deleteEdge('edge-1');
    await api.listNodeAgentRules('node-1');
    await api.createNodeAgentRule('node-1', { ruleType: 'resolver_fn', resolverKey: 'owner' });
    await api.updateAgentRule('rule-1', { sortOrder: 2 });
    await api.deleteAgentRule('rule-1');
    await api.listGraphTransitionEffects('graph-1');
    await api.createGraphTransitionEffect('graph-1', { effectKey: 'notify' });
    await api.updateTransitionEffect('effect-1', { action: 'approve' });
    await api.deleteTransitionEffect('effect-1');
    await api.listNodeFormRules('node-1');
    await api.createNodeFormRule('node-1', { formId: 'form-1', gatingMode: 'all_required' });
    await api.updateNodeFormRule('form-rule-1', { gatingMode: 'score_threshold', threshold: '2' });
    await api.deleteNodeFormRule('form-rule-1');

    expect(client.calls).toEqual(expect.arrayContaining([
      { method: 'GET', path: '/flow/scopes', options: undefined },
      { method: 'GET', path: '/flow/scopes/scope-1', options: undefined },
      { method: 'PATCH', path: '/flow/scopes/scope-1', body: { label: 'Scope' }, options: undefined },
      { method: 'DELETE', path: '/flow/scopes/scope-1', options: undefined },
      {
        method: 'POST',
        path: '/flow/graphs/graph-1/publish',
        body: { expectedDraftVersion: 'v1', notes: 'Release' },
        options: { headers: { 'Idempotency-Key': 'publish-key' } },
      },
      { method: 'DELETE', path: '/flow/graphs/graph-1', options: undefined },
      { method: 'DELETE', path: '/flow/nodes/node-1', options: undefined },
      { method: 'DELETE', path: '/flow/edges/edge-1', options: undefined },
      { method: 'POST', path: '/flow/nodes/node-1/agent-rules', body: { ruleType: 'resolver_fn', resolverKey: 'owner' }, options: undefined },
      { method: 'PATCH', path: '/flow/agent-rules/rule-1', body: { sortOrder: 2 }, options: undefined },
      { method: 'DELETE', path: '/flow/agent-rules/rule-1', options: undefined },
      { method: 'POST', path: '/flow/graphs/graph-1/transition-effects', body: { effectKey: 'notify' }, options: undefined },
      { method: 'PATCH', path: '/flow/transition-effects/effect-1', body: { action: 'approve' }, options: undefined },
      { method: 'DELETE', path: '/flow/transition-effects/effect-1', options: undefined },
      { method: 'POST', path: '/flow/nodes/node-1/form-rules', body: { formId: 'form-1', gatingMode: 'all_required' }, options: undefined },
      { method: 'PATCH', path: '/flow/node-form-rules/form-rule-1', body: { gatingMode: 'score_threshold', threshold: '2' }, options: undefined },
      { method: 'DELETE', path: '/flow/node-form-rules/form-rule-1', options: undefined },
    ]));
  });

  it('covers forms, fills, answers, waivers, policies, analytics, signal, and effect routes', async () => {
    const client = createClient();
    const api = createApi(client);

    await api.listForms('scope-1');
    await api.getForm('form-1');
    await api.createForm({ scopeId: 'scope-1', code: 'screen' });
    await api.updateForm('form-1', { title: 'Screen' });
    await api.deleteForm('form-1');
    await api.listQuestions('form-1');
    await api.createQuestion('form-1', { key: 'approved', fieldType: 'boolean' });
    await api.updateQuestion('question-1', { label: 'Approved' });
    await api.deleteQuestion('question-1');
    await api.getQuestionScore('question-1');
    await api.putQuestionScore('question-1', { passPoints: '2' });
    await api.deleteQuestionScore('question-1');
    await api.listFills({ formId: 'form-1', targetId: 'target-1' });
    await api.getFill('fill-1');
    await api.getFormFill('form-1', 'fill-1');
    await api.createFill('form-1', { targetType: 'generic', targetId: 'target-1' });
    await api.createFillAlias({ formId: 'form-1', targetType: 'generic', targetId: 'target-1' });
    await api.updateFill('fill-1', { status: 'submitted' });
    await api.deleteFill('fill-1');
    await api.listAnswers('fill-1');
    await api.listFormFillAnswers('form-1', 'fill-1');
    await api.upsertAnswer('fill-1', { questionId: 'question-1', value: true });
    await api.bulkUpsertAnswers('fill-1', [{ questionId: 'question-1', value: true }]);
    await api.updateAnswer('answer-1', { value: false });
    await api.deleteAnswer('answer-1');
    await api.listWaivers({ formId: 'form-1' });
    await api.listFillWaivers('fill-1');
    await api.listFormFillWaivers('form-1', 'fill-1');
    await api.createWaiver({ formId: 'form-1', reason: 'not applicable' });
    await api.createFormFillWaiver('form-1', 'fill-1', { reason: 'not applicable' });
    await api.updateWaiver('waiver-1', { reason: 'approved' });
    await api.deleteWaiver('waiver-1');
    await api.openTasks({ scopeCode: 'scope', page: 2, pageSize: 25 });
    await api.runsSummary({ scopeCode: 'scope', status: 'active' });
    await api.signal({ scopeCode: 'scope', targetType: 'generic', targetId: 'target-1' });
    await api.dispatchEffects({ runId: 'run-1', limit: 10 });
    await api.listPolicySets('scope-1');
    await api.getPolicySet('policy-set-1');
    await api.createPolicySet({ scopeId: 'scope-1', version: 'v1' });
    await api.updatePolicySet('policy-set-1', { isActive: true });
    await api.deletePolicySet('policy-set-1');
    await api.listPolicyRules('policy-set-1');
    await api.getPolicyRule('policy-rule-1');
    await api.createPolicyRule('policy-set-1', { action: 'approve', effect: 'allow' });
    await api.updatePolicyRule('policy-rule-1', { priority: 5 });
    await api.deletePolicyRule('policy-rule-1');
    await api.evaluatePolicy({ scopeId: 'scope-1', action: 'approve', facts: {} });

    expect(client.calls).toEqual(expect.arrayContaining([
      { method: 'DELETE', path: '/flow/forms/form-1', options: undefined },
      { method: 'POST', path: '/flow/forms/form-1/questions', body: { key: 'approved', fieldType: 'boolean' }, options: undefined },
      { method: 'PATCH', path: '/flow/questions/question-1', body: { label: 'Approved' }, options: undefined },
      { method: 'DELETE', path: '/flow/questions/question-1', options: undefined },
      { method: 'GET', path: '/flow/questions/question-1/score', options: undefined },
      { method: 'DELETE', path: '/flow/questions/question-1/score', options: undefined },
      { method: 'GET', path: '/flow/forms/form-1/fills/fill-1', options: undefined },
      { method: 'POST', path: '/flow/fills', body: { formId: 'form-1', targetType: 'generic', targetId: 'target-1' }, options: undefined },
      { method: 'PUT', path: '/flow/fills/fill-1/answers', body: [{ questionId: 'question-1', value: true }], options: undefined },
      { method: 'PATCH', path: '/flow/answers/answer-1', body: { value: false }, options: undefined },
      { method: 'DELETE', path: '/flow/answers/answer-1', options: undefined },
      { method: 'GET', path: '/flow/fills/fill-1/waivers', options: undefined },
      { method: 'GET', path: '/flow/forms/form-1/fills/fill-1/waivers', options: undefined },
      { method: 'POST', path: '/flow/forms/form-1/fills/fill-1/waivers', body: { reason: 'not applicable' }, options: undefined },
      { method: 'PATCH', path: '/flow/waivers/waiver-1', body: { reason: 'approved' }, options: undefined },
      { method: 'DELETE', path: '/flow/waivers/waiver-1', options: undefined },
      { method: 'POST', path: '/flow/signal', body: { scopeCode: 'scope', targetType: 'generic', targetId: 'target-1' }, options: undefined },
      { method: 'POST', path: '/flow/effects/dispatch', body: { runId: 'run-1', limit: 10 }, options: undefined },
      { method: 'POST', path: '/flow/policies/evaluate', body: { scopeId: 'scope-1', action: 'approve', facts: {} }, options: undefined },
    ]));
  });

  it('covers runtime, task action, candidate, user lookup, and event routes', async () => {
    const client = createClient();
    const api = createApi(client);

    await api.listRuns({ scopeId: 'scope-1' });
    await api.ensureRun({ graphCode: 'approval', scopeCode: 'scope', targetId: 'target-1' });
    await api.getRun('run-1');
    await api.updateRun('run-1', { status: 'canceled' });
    await api.listRunNodeRuns('run-1');
    await api.listRunTasks('run-1');
    await api.listRunEvents('run-1');
    await api.getRunFacts('run-1');
    await api.listNodeRuns({ runId: 'run-1', status: 'in_progress' });
    await api.getNodeRun('node-run-1');
    await api.listEvents({ runId: 'run-1', kind: 'task_done' });
    await api.listTasks({ mine: true, status: 'open' });
    await api.getTask('task-1');
    await api.taskCandidates('task-1');
    await api.usersByRole('reviewer', 'ana');
    await api.taskUser('user-1');
    await api.acceptTask('task-1', 'accepting');
    await api.declineTask('task-1', 'declining');
    await api.unacceptTask('task-1', 'undo');
    await api.withdrawTask('task-1', 'withdraw');
    await api.actTask('task-1', 'approve', 'approved');
    await api.assignTask('task-1', 'user-1', 'assign');
    await api.unassignTask('task-1', 'unassign');

    expect(client.calls).toEqual(expect.arrayContaining([
      { method: 'GET', path: '/flow/runs/run-1', options: undefined },
      { method: 'PATCH', path: '/flow/runs/run-1', body: { status: 'canceled' }, options: undefined },
      { method: 'GET', path: '/flow/runs/run-1/events', options: undefined },
      { method: 'GET', path: '/flow/runs/run-1/facts', options: undefined },
      { method: 'GET', path: '/flow/node-runs/node-run-1', options: undefined },
      { method: 'GET', path: '/flow/tasks/task-1/candidates', options: undefined },
      { method: 'GET', path: '/flow/tasks/roles/reviewer/users', options: { query: { search: 'ana' } } },
      { method: 'GET', path: '/flow/tasks/users/user-1', options: undefined },
      { method: 'POST', path: '/flow/tasks/task-1/accept', body: { note: 'accepting' }, options: undefined },
      { method: 'POST', path: '/flow/tasks/task-1/decline', body: { note: 'declining' }, options: undefined },
      { method: 'POST', path: '/flow/tasks/task-1/unaccept', body: { note: 'undo' }, options: undefined },
      { method: 'POST', path: '/flow/tasks/task-1/withdraw', body: { note: 'withdraw' }, options: undefined },
      { method: 'POST', path: '/flow/tasks/task-1/unassign', body: { note: 'unassign' }, options: undefined },
    ]));
  });

  it('omits query options for absent or undefined filters', async () => {
    const client = createClient();
    const api = createApi(client);

    await api.listGraphs();
    await api.listRuns();
    await api.listNodeRuns();
    await api.listTasks();
    await api.usersByRole('reviewer');
    await api.listForms();
    await api.listFills();
    await api.listWaivers();
    await api.listEvents();
    await api.openTasks();
    await api.runsSummary();
    await api.listPolicySets();
    const undefinedFilters = { formId: undefined, targetId: undefined } as unknown as Parameters<FlowApiService['listFills']>[0];
    await api.listFills(undefinedFilters);

    expect(client.calls).toEqual(expect.arrayContaining([
      { method: 'GET', path: '/flow/graphs', options: {} },
      { method: 'GET', path: '/flow/runs', options: {} },
      { method: 'GET', path: '/flow/node-runs', options: {} },
      { method: 'GET', path: '/flow/tasks', options: {} },
      { method: 'GET', path: '/flow/tasks/roles/reviewer/users', options: {} },
      { method: 'GET', path: '/flow/forms', options: {} },
      { method: 'GET', path: '/flow/fills', options: {} },
      { method: 'GET', path: '/flow/waivers', options: {} },
      { method: 'GET', path: '/flow/events', options: {} },
      { method: 'GET', path: '/flow/open-tasks', options: {} },
      { method: 'GET', path: '/flow/runs/summary', options: {} },
      { method: 'GET', path: '/flow/policies/sets', options: {} },
    ]));
  });
});
