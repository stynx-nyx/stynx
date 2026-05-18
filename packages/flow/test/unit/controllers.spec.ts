import { FlowAgentRulesController } from '../../src/controllers/agent-rules.controller';
import { FlowAnalyticsController } from '../../src/controllers/analytics.controller';
import { FlowAnswersController } from '../../src/controllers/answers.controller';
import { FlowEdgesController } from '../../src/controllers/edges.controller';
import { FlowEffectsController } from '../../src/controllers/effects.controller';
import { FlowEventsController } from '../../src/controllers/events.controller';
import { FlowFillsController } from '../../src/controllers/fills.controller';
import { FlowFormsController } from '../../src/controllers/forms.controller';
import { FlowGraphsController } from '../../src/controllers/graphs.controller';
import { FlowNodeFormRulesController } from '../../src/controllers/node-form-rules.controller';
import { FlowNodeRunsController } from '../../src/controllers/node-runs.controller';
import { FlowNodesController } from '../../src/controllers/nodes.controller';
import { FlowPoliciesController } from '../../src/controllers/policies.controller';
import { FlowQuestionsController } from '../../src/controllers/questions.controller';
import { FlowRunsController } from '../../src/controllers/runs.controller';
import { FlowScopesController } from '../../src/controllers/scopes.controller';
import { FlowSignalController } from '../../src/controllers/signal.controller';
import { FlowTasksController } from '../../src/controllers/tasks.controller';
import { FlowTransitionEffectsController } from '../../src/controllers/transition-effects.controller';
import { FlowWaiversController } from '../../src/controllers/waivers.controller';

function service(methods: string[]) {
  return Object.fromEntries(methods.map((method) => [method, vi.fn(() => ({ method }))]));
}

describe('Flow controllers', () => {
  it('delegates design controller methods to FlowDesignService', () => {
    const design = service([
      'listScopes',
      'getScope',
      'createScope',
      'updateScope',
      'deleteScope',
      'listGraphs',
      'getGraph',
      'exportGraph',
      'createGraph',
      'importGraph',
      'updateGraph',
      'deleteGraph',
      'listGraphNodes',
      'createGraphNode',
      'listGraphEdges',
      'createGraphEdge',
      'listGraphTransitionEffects',
      'createGraphTransitionEffect',
      'getNode',
      'updateNode',
      'deleteNode',
      'listNodeAgentRules',
      'createNodeAgentRule',
      'listNodeFormRules',
      'createNodeFormRule',
      'getEdge',
      'updateEdge',
      'deleteEdge',
      'getAgentRule',
      'updateAgentRule',
      'deleteAgentRule',
      'getTransitionEffect',
      'updateTransitionEffect',
      'deleteTransitionEffect',
      'getNodeFormRule',
      'updateNodeFormRule',
      'deleteNodeFormRule',
    ]);

    const scopes = new FlowScopesController(design as never);
    scopes.list();
    scopes.get('scope-1');
    scopes.create({ code: 'scope' });
    scopes.update('scope-1', { label: 'Scope' });
    scopes.delete('scope-1');

    const graphs = new FlowGraphsController(design as never);
    graphs.list('scope-1');
    graphs.get('graph-1');
    graphs.export('graph-1');
    graphs.create({ code: 'graph' });
    graphs.import({ code: 'imported' });
    graphs.update('graph-1', { name: 'Graph' });
    graphs.delete('graph-1');
    graphs.listNodes('graph-1');
    graphs.createNode('graph-1', { code: 'node' });
    graphs.listEdges('graph-1');
    graphs.createEdge('graph-1', { action: 'approve' });
    graphs.listTransitionEffects('graph-1');
    graphs.createTransitionEffect('graph-1', { effectKey: 'notify' });

    const nodes = new FlowNodesController(design as never);
    nodes.get('node-1');
    nodes.update('node-1', { name: 'Node' });
    nodes.delete('node-1');
    nodes.listAgentRules('node-1');
    nodes.createAgentRule('node-1', { ruleType: 'permission' });
    nodes.listFormRules('node-1');
    nodes.createFormRule('node-1', { formId: 'form-1' });

    new FlowEdgesController(design as never).get('edge-1');
    new FlowEdgesController(design as never).update('edge-1', { action: 'reject' });
    new FlowEdgesController(design as never).delete('edge-1');
    new FlowAgentRulesController(design as never).get('rule-1');
    new FlowAgentRulesController(design as never).update('rule-1', { sortOrder: 2 });
    new FlowAgentRulesController(design as never).delete('rule-1');
    new FlowTransitionEffectsController(design as never).get('effect-1');
    new FlowTransitionEffectsController(design as never).update('effect-1', { effectKey: 'email' });
    new FlowTransitionEffectsController(design as never).delete('effect-1');
    new FlowNodeFormRulesController(design as never).get('form-rule-1');
    new FlowNodeFormRulesController(design as never).update('form-rule-1', { sortOrder: 3 });
    new FlowNodeFormRulesController(design as never).delete('form-rule-1');

    expect(design.createGraphNode).toHaveBeenCalledWith('graph-1', { code: 'node' });
    expect(design.createNodeAgentRule).toHaveBeenCalledWith('node-1', { ruleType: 'permission' });
    expect(design.updateTransitionEffect).toHaveBeenCalledWith('effect-1', { effectKey: 'email' });
  });

  it('delegates form and fill controller methods to FlowFormsService', () => {
    const forms = service([
      'listForms',
      'getForm',
      'createForm',
      'updateForm',
      'deleteForm',
      'listQuestions',
      'createQuestion',
      'listFormFills',
      'getFormFill',
      'listFormFillAnswers',
      'listFormFillWaivers',
      'createFill',
      'createFormFillWaiver',
      'listFills',
      'getFill',
      'createFillFromBody',
      'updateFill',
      'deleteFill',
      'listAnswers',
      'upsertAnswer',
      'bulkUpsertAnswers',
      'createFillWaiver',
      'listFillWaivers',
      'getQuestion',
      'updateQuestion',
      'deleteQuestion',
      'getQuestionScore',
      'putQuestionScore',
      'deleteQuestionScore',
      'updateAnswer',
      'deleteAnswer',
      'listWaivers',
      'createWaiver',
      'updateWaiver',
      'deleteWaiver',
    ]);

    const formController = new FlowFormsController(forms as never);
    formController.list('scope-1');
    formController.get('form-1');
    formController.create({ code: 'form' });
    formController.update('form-1', { title: 'Form' });
    formController.delete('form-1');
    formController.questions('form-1');
    formController.createQuestion('form-1', { key: 'approved' });
    formController.fills('form-1');
    formController.fillDetail('form-1', 'fill-1');
    formController.fillAnswers('form-1', 'fill-1');
    formController.fillWaivers('form-1', 'fill-1');
    formController.createFill('form-1', { targetId: 'target-1' });
    formController.createFillWaiver('form-1', 'fill-1', { reason: 'override' });

    const fillController = new FlowFillsController(forms as never);
    fillController.list({ status: 'draft' });
    fillController.get('fill-1');
    fillController.create({ formId: 'form-1' });
    fillController.update('fill-1', { status: 'submitted' });
    fillController.delete('fill-1');
    fillController.answers('fill-1');
    fillController.upsertAnswer('fill-1', { questionId: 'question-1' });
    fillController.bulkUpsertAnswers('fill-1', [{ questionId: 'question-1' }]);
    fillController.createWaiver('fill-1', { reason: 'manual' });
    fillController.waivers('fill-1');

    const questionController = new FlowQuestionsController(forms as never);
    questionController.get('question-1');
    questionController.update('question-1', { label: 'Approved' });
    questionController.delete('question-1');
    questionController.score('question-1');
    questionController.putScore('question-1', { passPoints: 1 });
    questionController.deleteScore('question-1');

    new FlowAnswersController(forms as never).update('answer-1', { value: true });
    new FlowAnswersController(forms as never).delete('answer-1');
    const waiverController = new FlowWaiversController(forms as never);
    waiverController.list({ targetType: 'record' });
    waiverController.create({ reason: 'manual' });
    waiverController.update('waiver-1', { reason: 'changed' });
    waiverController.delete('waiver-1');

    expect(forms.createFormFillWaiver).toHaveBeenCalledWith('form-1', 'fill-1', { reason: 'override' });
    expect(forms.bulkUpsertAnswers).toHaveBeenCalledWith('fill-1', [{ questionId: 'question-1' }]);
    expect(forms.putQuestionScore).toHaveBeenCalledWith('question-1', { passPoints: 1 });
  });

  it('delegates runtime, analytics, policy, signal, and effect methods', () => {
    const runtime = service([
      'listRuns',
      'ensureRun',
      'getRun',
      'updateRun',
      'listRunNodeRuns',
      'listNodeRuns',
      'listRunTasks',
      'listRunEvents',
      'getRunFacts',
      'listTasks',
      'getTask',
      'taskCandidates',
      'listUsersForRole',
      'getTaskUser',
      'actTask',
      'acceptTask',
      'declineTask',
      'unacceptTask',
      'withdrawTask',
      'assignTask',
      'unassignTask',
      'listEvents',
      'listNodeRuns',
      'getNodeRun',
      'signal',
      'dispatchPendingEffects',
    ]);
    const analytics = service(['openTasks', 'runsSummary']);
    const policies = service([
      'listPolicySets',
      'getPolicySet',
      'createPolicySet',
      'updatePolicySet',
      'deletePolicySet',
      'listPolicyRules',
      'createPolicyRule',
      'getPolicyRule',
      'updatePolicyRule',
      'deletePolicyRule',
      'evaluate',
    ]);

    const runs = new FlowRunsController(runtime as never, analytics as never);
    runs.list({ status: 'active' });
    runs.ensure({ graphId: 'graph-1' });
    runs.summary({ scopeId: 'scope-1' });
    runs.get('run-1');
    runs.update('run-1', { status: 'completed' });
    runs.listNodeRuns('run-1');
    runs.listTasks('run-1');
    runs.listEvents('run-1');
    runs.facts('run-1');

    const tasks = new FlowTasksController(runtime as never);
    tasks.list({ mine: true });
    tasks.get('task-1');
    tasks.candidates('task-1');
    tasks.usersByRole('reviewer', 'ana');
    tasks.user('user-1');
    tasks.act('task-1', { action: 'approve' });
    tasks.accept('task-1', { note: 'ok' });
    tasks.decline('task-1', { note: 'no' });
    tasks.unaccept('task-1', {});
    tasks.withdraw('task-1', {});
    tasks.assign('task-1', { userId: 'user-1' });
    tasks.unassign('task-1', {});

    new FlowEventsController(runtime as never).list({ runId: 'run-1' });
    const nodeRuns = new FlowNodeRunsController(runtime as never);
    nodeRuns.list({ runId: 'run-1' });
    nodeRuns.get('node-run-1');
    new FlowSignalController(runtime as never).signal({ runId: 'run-1' });
    new FlowEffectsController(runtime as never).dispatch({ effectKey: 'email' });
    new FlowAnalyticsController(analytics as never).openTasks({ status: 'open' });

    const policyController = new FlowPoliciesController(policies as never);
    policyController.listSets('scope-1');
    policyController.getSet('policy-set-1');
    policyController.createSet({ code: 'set' });
    policyController.updateSet('policy-set-1', { code: 'set2' });
    policyController.deleteSet('policy-set-1');
    policyController.listRules('policy-set-1');
    policyController.createRule('policy-set-1', { effect: 'allow' });
    policyController.getRule('rule-1');
    policyController.updateRule('rule-1', { effect: 'deny' });
    policyController.deleteRule('rule-1');
    policyController.evaluate({ action: 'approve' });

    expect(runtime.acceptTask).toHaveBeenCalledWith('task-1', { note: 'ok' });
    expect(analytics.runsSummary).toHaveBeenCalledWith({ scopeId: 'scope-1' });
    expect(policies.createPolicyRule).toHaveBeenCalledWith('policy-set-1', { effect: 'allow' });
  });
});
