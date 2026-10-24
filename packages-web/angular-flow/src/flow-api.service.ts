import * as response from './response-validation';
import type { FlowGraphInput, FlowNodeInput, FlowEdgeInput, FlowAgentRuleInput, FlowTransitionEffectInput, FlowNodeFormRuleInput, FlowFormInput, FlowFillInput, FlowWaiverInput, FlowPolicySetInput, FlowPolicyRuleInput } from './types';
import { Injectable, inject } from '@angular/core';
import { STYNX_FLOW_CLIENT } from './tokens';
import type {
  FlowAgentRule,
  FlowAnswer,
  FlowEdge,
  FlowFill,
  FlowForm,
  FlowGraph,
  FlowGraphExport,
  FlowDashboardAnalytics,
  FlowNode,
  FlowNodeFormRule,
  FlowNodeRun,
  FlowOpenTask,
  FlowPage,
  FlowPolicyDecision,
  FlowPolicyRule,
  FlowPolicySet,
  FlowQuestion,
  FlowRunActivityEvent,
  FlowRun,
  FlowRunSummary,
  FlowScope,
  FlowScore,
  FlowTask,
  FlowTaskCandidate,
  FlowTaskUser,
  FlowTransitionEffect,
  FlowWaiver,
  FlowEffectDispatchSummary,
  FlowEvent,
  PublishFlowGraphRequest,
  PublishFlowGraphResponse,
} from './types';

type QueryValue = string | number | boolean | null | undefined;
type FlowQuery = Record<string, QueryValue>;
export type FlowTaskFilters = {
  runId?: string;
  assignee?: string;
  assigneeUserId?: string;
  status?: string;
  mine?: boolean;
};

function query(input: FlowQuery): Record<string, Exclude<QueryValue, undefined>> | undefined {
  const filtered: Record<string, Exclude<QueryValue, undefined>> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      filtered[key] = value;
    }
  }
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function options(input: FlowQuery): { query?: Record<string, Exclude<QueryValue, undefined>> } {
  const filtered = query(input);
  return filtered ? { query: filtered } : {};
}

@Injectable({ providedIn: 'root' })
export class FlowApiService {
  private readonly client = inject(STYNX_FLOW_CLIENT);

  listScopes(): Promise<FlowScope[]> {
    return this.client.get('/flow/scopes').then(response.decode(response.array(response.isFlowScope), 'FlowScope[]'));
  }

  getScope(id: string): Promise<FlowScope> {
    return this.client.get(`/flow/scopes/${id}`).then(response.decode(response.isFlowScope, 'FlowScope'));
  }

  createScope(input: Partial<FlowScope>): Promise<FlowScope> {
    return this.client.post('/flow/scopes', input).then(response.decode(response.isFlowScope, 'FlowScope'));
  }

  updateScope(id: string, input: Partial<FlowScope>): Promise<FlowScope> {
    return this.client.patch(`/flow/scopes/${id}`, input).then(response.decode(response.isFlowScope, 'FlowScope'));
  }

  deleteScope(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/scopes/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listGraphs(scopeId?: string): Promise<FlowGraph[]> {
    return this.client.get('/flow/graphs', options({ scopeId })).then(response.decode(response.array(response.isFlowGraph), 'FlowGraph[]'));
  }

  getGraph(id: string): Promise<FlowGraph> {
    return this.client.get(`/flow/graphs/${id}`).then(response.decode(response.isFlowGraph, 'FlowGraph'));
  }

  exportGraph(id: string): Promise<FlowGraphExport> {
    return this.client.get(`/flow/graphs/${id}/export`).then(response.decode(response.isFlowGraphExport, 'FlowGraphExport'));
  }

  importGraph(input: unknown): Promise<FlowGraphExport> {
    return this.client.post('/flow/graphs/import', input).then(response.decode(response.isFlowGraphExport, 'FlowGraphExport'));
  }

  createGraph(input: FlowGraphInput): Promise<FlowGraph> {
    return this.client.post('/flow/graphs', input).then(response.decode(response.isFlowGraph, 'FlowGraph'));
  }

  updateGraph(id: string, input: FlowGraphInput): Promise<FlowGraph> {
    return this.client.patch(`/flow/graphs/${id}`, input).then(response.decode(response.isFlowGraph, 'FlowGraph'));
  }

  publishGraph(
    id: string,
    input: PublishFlowGraphRequest = {},
    idempotencyKey?: string,
  ): Promise<PublishFlowGraphResponse> {
    return this.client.post(
      `/flow/graphs/${id}/publish`,
      input,
      idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined,
    ).then(response.decode(response.isPublishFlowGraphResponse, 'PublishFlowGraphResponse'));
  }

  deleteGraph(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/graphs/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listGraphNodes(graphId: string): Promise<FlowNode[]> {
    return this.client.get(`/flow/graphs/${graphId}/nodes`).then(response.decode(response.array(response.isFlowNode), 'FlowNode[]'));
  }

  createGraphNode(graphId: string, input: FlowNodeInput): Promise<FlowNode> {
    return this.client.post(`/flow/graphs/${graphId}/nodes`, input).then(response.decode(response.isFlowNode, 'FlowNode'));
  }

  updateNode(id: string, input: FlowNodeInput): Promise<FlowNode> {
    return this.client.patch(`/flow/nodes/${id}`, input).then(response.decode(response.isFlowNode, 'FlowNode'));
  }

  deleteNode(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/nodes/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listGraphEdges(graphId: string): Promise<FlowEdge[]> {
    return this.client.get(`/flow/graphs/${graphId}/edges`).then(response.decode(response.array(response.isFlowEdge), 'FlowEdge[]'));
  }

  createGraphEdge(graphId: string, input: FlowEdgeInput): Promise<FlowEdge> {
    return this.client.post(`/flow/graphs/${graphId}/edges`, input).then(response.decode(response.isFlowEdge, 'FlowEdge'));
  }

  updateEdge(id: string, input: FlowEdgeInput): Promise<FlowEdge> {
    return this.client.patch(`/flow/edges/${id}`, input).then(response.decode(response.isFlowEdge, 'FlowEdge'));
  }

  deleteEdge(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/edges/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listNodeAgentRules(nodeId: string): Promise<FlowAgentRule[]> {
    return this.client.get(`/flow/nodes/${nodeId}/agent-rules`).then(response.decode(response.array(response.isFlowAgentRule), 'FlowAgentRule[]'));
  }

  createNodeAgentRule(nodeId: string, input: FlowAgentRuleInput): Promise<FlowAgentRule> {
    return this.client.post(`/flow/nodes/${nodeId}/agent-rules`, input).then(response.decode(response.isFlowAgentRule, 'FlowAgentRule'));
  }

  updateAgentRule(id: string, input: FlowAgentRuleInput): Promise<FlowAgentRule> {
    return this.client.patch(`/flow/agent-rules/${id}`, input).then(response.decode(response.isFlowAgentRule, 'FlowAgentRule'));
  }

  deleteAgentRule(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/agent-rules/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listNodeFormRules(nodeId: string): Promise<FlowNodeFormRule[]> {
    return this.client.get(`/flow/nodes/${nodeId}/form-rules`).then(response.decode(response.array(response.isFlowNodeFormRule), 'FlowNodeFormRule[]'));
  }

  createNodeFormRule(nodeId: string, input: FlowNodeFormRuleInput): Promise<FlowNodeFormRule> {
    return this.client.post(`/flow/nodes/${nodeId}/form-rules`, input).then(response.decode(response.isFlowNodeFormRule, 'FlowNodeFormRule'));
  }

  updateNodeFormRule(id: string, input: FlowNodeFormRuleInput): Promise<FlowNodeFormRule> {
    return this.client.patch(`/flow/node-form-rules/${id}`, input).then(response.decode(response.isFlowNodeFormRule, 'FlowNodeFormRule'));
  }

  deleteNodeFormRule(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/node-form-rules/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listGraphTransitionEffects(graphId: string): Promise<FlowTransitionEffect[]> {
    return this.client.get(`/flow/graphs/${graphId}/transition-effects`).then(response.decode(response.array(response.isFlowTransitionEffect), 'FlowTransitionEffect[]'));
  }

  createGraphTransitionEffect(graphId: string, input: FlowTransitionEffectInput): Promise<FlowTransitionEffect> {
    return this.client.post(`/flow/graphs/${graphId}/transition-effects`, input).then(response.decode(response.isFlowTransitionEffect, 'FlowTransitionEffect'));
  }

  updateTransitionEffect(id: string, input: FlowTransitionEffectInput): Promise<FlowTransitionEffect> {
    return this.client.patch(`/flow/transition-effects/${id}`, input).then(response.decode(response.isFlowTransitionEffect, 'FlowTransitionEffect'));
  }

  deleteTransitionEffect(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/transition-effects/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listRuns(filters: { scopeId?: string; graphId?: string; targetType?: string; targetId?: string; status?: string } = {}): Promise<FlowPage<FlowRun>> {
    return this.client.get('/flow/runs', options(filters)).then(response.decode(response.isFlowPage(response.isFlowRun), 'FlowPage<FlowRun>'));
  }

  ensureRun(input: unknown): Promise<{ runId: string }> {
    return this.client.post('/flow/runs/ensure', input).then(response.decode(response.isEnsureResult, '{ runId: string }'));
  }

  getRun(id: string): Promise<FlowRun> {
    return this.client.get(`/flow/runs/${id}`).then(response.decode(response.isFlowRun, 'FlowRun'));
  }

  updateRun(id: string, input: Partial<FlowRun>): Promise<FlowRun> {
    return this.client.patch(`/flow/runs/${id}`, input).then(response.decode(response.isFlowRun, 'FlowRun'));
  }

  listRunNodeRuns(runId: string): Promise<FlowNodeRun[]> {
    return this.client.get(`/flow/runs/${runId}/nodes`).then(response.decode(response.array(response.isFlowNodeRun), 'FlowNodeRun[]'));
  }

  listRunTasks(runId: string): Promise<FlowTask[]> {
    return this.client.get(`/flow/runs/${runId}/tasks`).then(response.decode(response.array(response.isFlowTask), 'FlowTask[]'));
  }

  listRunEvents(runId: string): Promise<FlowEvent[]> {
    return this.client.get(`/flow/runs/${runId}/events`).then(response.decode(response.array(response.isFlowEvent), 'FlowEvent[]'));
  }

  listRunActivity(runId: string, filters: { cursor?: string; page?: number; pageSize?: number } = {}): Promise<FlowPage<FlowRunActivityEvent>> {
    return this.client.get(`/flow/runs/${runId}/activity`, options(filters)).then(response.decode(response.isFlowPage(response.isFlowRunActivityEvent), 'FlowPage<FlowRunActivityEvent>'));
  }

  getRunFacts(runId: string): Promise<Record<string, unknown>> {
    return this.client.get(`/flow/runs/${runId}/facts`).then(response.decode(response.record, 'Record<string, unknown>'));
  }

  listNodeRuns(filters: { runId?: string; status?: string } = {}): Promise<FlowPage<FlowNodeRun>> {
    return this.client.get('/flow/node-runs', options(filters)).then(response.decode(response.isFlowPage(response.isFlowNodeRun), 'FlowPage<FlowNodeRun>'));
  }

  getNodeRun(id: string): Promise<FlowNodeRun> {
    return this.client.get(`/flow/node-runs/${id}`).then(response.decode(response.isFlowNodeRun, 'FlowNodeRun'));
  }

  listTasks(filters: FlowTaskFilters = {}): Promise<FlowPage<FlowTask>> {
    const { assignee, ...rest } = filters;
    const normalized = assignee === 'me'
      ? { ...rest, mine: true }
      : assignee
        ? { ...rest, assigneeUserId: assignee }
        : rest;
    return this.client.get('/flow/tasks', options(normalized)).then(response.decode(response.isFlowPage(response.isFlowTask), 'FlowPage<FlowTask>'));
  }

  getTask(id: string): Promise<FlowTask> {
    return this.client.get(`/flow/tasks/${id}`).then(response.decode(response.isFlowTask, 'FlowTask'));
  }

  taskCandidates(taskId: string): Promise<FlowTaskCandidate[]> {
    return this.client.get(`/flow/tasks/${taskId}/candidates`).then(response.decode(response.array(response.isFlowTaskCandidate), 'FlowTaskCandidate[]'));
  }

  usersByRole(role: string, search?: string): Promise<FlowTaskUser[]> {
    return this.client.get(`/flow/tasks/roles/${role}/users`, options({ search })).then(response.decode(response.array(response.isFlowTaskUser), 'FlowTaskUser[]'));
  }

  taskUser(id: string): Promise<FlowTaskUser> {
    return this.client.get(`/flow/tasks/users/${id}`).then(response.decode(response.isFlowTaskUser, 'FlowTaskUser'));
  }

  actTask(taskId: string, action: string, note?: string): Promise<FlowTask> {
    return this.client.post(`/flow/tasks/${taskId}/act`, { action, note }).then(response.decode(response.isFlowTask, 'FlowTask'));
  }

  acceptTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post(`/flow/tasks/${taskId}/accept`, { note }).then(response.decode(response.isFlowTask, 'FlowTask'));
  }

  declineTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post(`/flow/tasks/${taskId}/decline`, { note }).then(response.decode(response.isFlowTask, 'FlowTask'));
  }

  unacceptTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post(`/flow/tasks/${taskId}/unaccept`, { note }).then(response.decode(response.isFlowTask, 'FlowTask'));
  }

  withdrawTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post(`/flow/tasks/${taskId}/withdraw`, { note }).then(response.decode(response.isFlowTask, 'FlowTask'));
  }

  assignTask(taskId: string, userId: string, note?: string): Promise<FlowTask> {
    return this.client.post(`/flow/tasks/${taskId}/assign`, { userId, note }).then(response.decode(response.isFlowTask, 'FlowTask'));
  }

  unassignTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post(`/flow/tasks/${taskId}/unassign`, { note }).then(response.decode(response.isFlowTask, 'FlowTask'));
  }

  listForms(scopeId?: string): Promise<FlowForm[]> {
    return this.client.get('/flow/forms', options({ scopeId })).then(response.decode(response.array(response.isFlowForm), 'FlowForm[]'));
  }

  getForm(id: string): Promise<FlowForm> {
    return this.client.get(`/flow/forms/${id}`).then(response.decode(response.isFlowForm, 'FlowForm'));
  }

  createForm(input: FlowFormInput): Promise<FlowForm> {
    return this.client.post('/flow/forms', input).then(response.decode(response.isFlowForm, 'FlowForm'));
  }

  updateForm(id: string, input: FlowFormInput): Promise<FlowForm> {
    return this.client.patch(`/flow/forms/${id}`, input).then(response.decode(response.isFlowForm, 'FlowForm'));
  }

  deleteForm(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/forms/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listQuestions(formId: string): Promise<FlowQuestion[]> {
    return this.client.get(`/flow/forms/${formId}/questions`).then(response.decode(response.array(response.isFlowQuestion), 'FlowQuestion[]'));
  }

  createQuestion(formId: string, input: Partial<FlowQuestion>): Promise<FlowQuestion> {
    return this.client.post(`/flow/forms/${formId}/questions`, input).then(response.decode(response.isFlowQuestion, 'FlowQuestion'));
  }

  updateQuestion(id: string, input: Partial<FlowQuestion>): Promise<FlowQuestion> {
    return this.client.patch(`/flow/questions/${id}`, input).then(response.decode(response.isFlowQuestion, 'FlowQuestion'));
  }

  deleteQuestion(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/questions/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  getQuestionScore(questionId: string): Promise<FlowScore> {
    return this.client.get(`/flow/questions/${questionId}/score`).then(response.decode(response.isFlowScore, 'FlowScore'));
  }

  putQuestionScore(questionId: string, input: Partial<FlowScore>): Promise<FlowScore> {
    return this.client.put(`/flow/questions/${questionId}/score`, input).then(response.decode(response.isFlowScore, 'FlowScore'));
  }

  deleteQuestionScore(questionId: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/questions/${questionId}/score`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listFills(filters: { formId?: string; scopeId?: string; runId?: string; taskId?: string; targetId?: string; targetType?: string } = {}): Promise<FlowFill[]> {
    return this.client.get('/flow/fills', options(filters)).then(response.decode(response.array(response.isFlowFill), 'FlowFill[]'));
  }

  getFill(id: string): Promise<FlowFill> {
    return this.client.get(`/flow/fills/${id}`).then(response.decode(response.isFlowFill, 'FlowFill'));
  }

  getFormFill(formId: string, fillId: string): Promise<FlowFill> {
    return this.client.get(`/flow/forms/${formId}/fills/${fillId}`).then(response.decode(response.isFlowFill, 'FlowFill'));
  }

  createFill(formId: string, input: FlowFillInput): Promise<FlowFill> {
    return this.client.post(`/flow/forms/${formId}/fills`, input).then(response.decode(response.isFlowFill, 'FlowFill'));
  }

  createFillAlias(input: FlowFillInput & { formId: string }): Promise<FlowFill> {
    return this.client.post('/flow/fills', input).then(response.decode(response.isFlowFill, 'FlowFill'));
  }

  updateFill(id: string, input: FlowFillInput): Promise<FlowFill> {
    return this.client.patch(`/flow/fills/${id}`, input).then(response.decode(response.isFlowFill, 'FlowFill'));
  }

  deleteFill(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/fills/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listAnswers(fillId: string): Promise<FlowAnswer[]> {
    return this.client.get(`/flow/fills/${fillId}/answers`).then(response.decode(response.array(response.isFlowAnswer), 'FlowAnswer[]'));
  }

  listFormFillAnswers(formId: string, fillId: string): Promise<FlowAnswer[]> {
    return this.client.get(`/flow/forms/${formId}/fills/${fillId}/answers`).then(response.decode(response.array(response.isFlowAnswer), 'FlowAnswer[]'));
  }

  upsertAnswer(fillId: string, input: Partial<FlowAnswer>): Promise<FlowAnswer> {
    return this.client.post(`/flow/fills/${fillId}/answers`, input).then(response.decode(response.isFlowAnswer, 'FlowAnswer'));
  }

  bulkUpsertAnswers(fillId: string, input: Array<Partial<FlowAnswer>>): Promise<FlowAnswer[]> {
    return this.client.put(`/flow/fills/${fillId}/answers`, input).then(response.decode(response.array(response.isFlowAnswer), 'FlowAnswer[]'));
  }

  updateAnswer(id: string, input: Partial<FlowAnswer>): Promise<FlowAnswer> {
    return this.client.patch(`/flow/answers/${id}`, input).then(response.decode(response.isFlowAnswer, 'FlowAnswer'));
  }

  deleteAnswer(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/answers/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listWaivers(filters: { scopeId?: string; formId?: string; questionId?: string; targetId?: string; targetType?: string } = {}): Promise<FlowWaiver[]> {
    return this.client.get('/flow/waivers', options(filters)).then(response.decode(response.array(response.isFlowWaiver), 'FlowWaiver[]'));
  }

  createWaiver(input: FlowWaiverInput): Promise<FlowWaiver> {
    return this.client.post('/flow/waivers', input).then(response.decode(response.isFlowWaiver, 'FlowWaiver'));
  }

  listFormFillWaivers(formId: string, fillId: string): Promise<FlowWaiver[]> {
    return this.client.get(`/flow/forms/${formId}/fills/${fillId}/waivers`).then(response.decode(response.array(response.isFlowWaiver), 'FlowWaiver[]'));
  }

  listFillWaivers(fillId: string): Promise<FlowWaiver[]> {
    return this.client.get(`/flow/fills/${fillId}/waivers`).then(response.decode(response.array(response.isFlowWaiver), 'FlowWaiver[]'));
  }

  createFormFillWaiver(formId: string, fillId: string, input: FlowWaiverInput): Promise<FlowWaiver> {
    return this.client.post(`/flow/forms/${formId}/fills/${fillId}/waivers`, input).then(response.decode(response.isFlowWaiver, 'FlowWaiver'));
  }

  updateWaiver(id: string, input: FlowWaiverInput): Promise<FlowWaiver> {
    return this.client.patch(`/flow/waivers/${id}`, input).then(response.decode(response.isFlowWaiver, 'FlowWaiver'));
  }

  deleteWaiver(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/waivers/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listEvents(filters: { runId?: string; nodeId?: string; taskId?: string; kind?: string; actorId?: string } = {}): Promise<FlowPage<FlowEvent>> {
    return this.client.get('/flow/events', options(filters)).then(response.decode(response.isFlowPage(response.isFlowEvent), 'FlowPage<FlowEvent>'));
  }

  signal(input: unknown): Promise<Record<string, unknown>> {
    return this.client.post('/flow/signal', input).then(response.decode(response.record, 'Record<string, unknown>'));
  }

  dispatchEffects(input: unknown): Promise<FlowEffectDispatchSummary> {
    return this.client.post('/flow/effects/dispatch', input).then(response.decode(response.isFlowEffectDispatchSummary, 'FlowEffectDispatchSummary'));
  }

  openTasks(filters: { scopeId?: string; scopeCode?: string; graphId?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<FlowPage<FlowOpenTask>> {
    return this.client.get('/flow/open-tasks', options(filters)).then(response.decode(response.isFlowPage(response.isFlowOpenTask), 'FlowPage<FlowOpenTask>'));
  }

  runsSummary(filters: { scopeId?: string; scopeCode?: string; graphId?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<FlowPage<FlowRunSummary>> {
    return this.client.get('/flow/runs/summary', options(filters)).then(response.decode(response.isFlowPage(response.isFlowRunSummary), 'FlowPage<FlowRunSummary>'));
  }

  dashboardAnalytics(filters: { scopeId?: string; scopeCode?: string; graphId?: string } = {}): Promise<FlowDashboardAnalytics> {
    return this.client.get('/flow/analytics/dashboard', options(filters)).then(response.decode(response.isFlowDashboardAnalytics, 'FlowDashboardAnalytics'));
  }

  listPolicySets(scopeId?: string): Promise<FlowPolicySet[]> {
    return this.client.get('/flow/policies/sets', options({ scopeId })).then(response.decode(response.array(response.isFlowPolicySet), 'FlowPolicySet[]'));
  }

  getPolicySet(id: string): Promise<FlowPolicySet> {
    return this.client.get(`/flow/policies/sets/${id}`).then(response.decode(response.isFlowPolicySet, 'FlowPolicySet'));
  }

  createPolicySet(input: FlowPolicySetInput): Promise<FlowPolicySet> {
    return this.client.post('/flow/policies/sets', input).then(response.decode(response.isFlowPolicySet, 'FlowPolicySet'));
  }

  updatePolicySet(id: string, input: FlowPolicySetInput): Promise<FlowPolicySet> {
    return this.client.patch(`/flow/policies/sets/${id}`, input).then(response.decode(response.isFlowPolicySet, 'FlowPolicySet'));
  }

  deletePolicySet(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/policies/sets/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  listPolicyRules(policySetId: string): Promise<FlowPolicyRule[]> {
    return this.client.get(`/flow/policies/sets/${policySetId}/rules`).then(response.decode(response.array(response.isFlowPolicyRule), 'FlowPolicyRule[]'));
  }

  getPolicyRule(id: string): Promise<FlowPolicyRule> {
    return this.client.get(`/flow/policies/rules/${id}`).then(response.decode(response.isFlowPolicyRule, 'FlowPolicyRule'));
  }

  createPolicyRule(policySetId: string, input: FlowPolicyRuleInput): Promise<FlowPolicyRule> {
    return this.client.post(`/flow/policies/sets/${policySetId}/rules`, input).then(response.decode(response.isFlowPolicyRule, 'FlowPolicyRule'));
  }

  updatePolicyRule(id: string, input: FlowPolicyRuleInput): Promise<FlowPolicyRule> {
    return this.client.patch(`/flow/policies/rules/${id}`, input).then(response.decode(response.isFlowPolicyRule, 'FlowPolicyRule'));
  }

  deletePolicyRule(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete(`/flow/policies/rules/${id}`).then(response.decode(response.isDeleteResult, '{ id: string; deleted: boolean }'));
  }

  evaluatePolicy(input: unknown): Promise<FlowPolicyDecision> {
    return this.client.post('/flow/policies/evaluate', input).then(response.decode(response.isFlowPolicyDecision, 'FlowPolicyDecision'));
  }
}
