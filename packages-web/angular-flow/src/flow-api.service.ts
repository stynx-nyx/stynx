import { Inject, Injectable } from '@angular/core';
import { STYNX_FLOW_CLIENT } from './tokens';
import type { StynxSdkClient } from '@stynx-web/sdk';
import type {
  FlowAgentRule,
  FlowAnswer,
  FlowEdge,
  FlowFill,
  FlowForm,
  FlowGraph,
  FlowGraphExport,
  FlowNode,
  FlowNodeFormRule,
  FlowNodeRun,
  FlowOpenTask,
  FlowPage,
  FlowPolicyDecision,
  FlowPolicyRule,
  FlowPolicySet,
  FlowQuestion,
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
} from './types';

type QueryValue = string | number | boolean | null | undefined;
type FlowQuery = Record<string, QueryValue>;

function query(input?: FlowQuery): Record<string, Exclude<QueryValue, undefined>> | undefined {
  if (!input) {
    return undefined;
  }
  const filtered = Object.fromEntries(
    Object.entries(input).filter((entry): entry is [string, Exclude<QueryValue, undefined>] =>
      entry[1] !== undefined,
    ),
  );
  return Object.keys(filtered).length > 0 ? filtered : undefined;
}

function options(input?: FlowQuery): { query?: Record<string, Exclude<QueryValue, undefined>> } {
  const filtered = query(input);
  return filtered ? { query: filtered } : {};
}

@Injectable({ providedIn: 'root' })
export class FlowApiService {
  constructor(@Inject(STYNX_FLOW_CLIENT) private readonly client: StynxSdkClient) {}

  listScopes(): Promise<FlowScope[]> {
    return this.client.get<FlowScope[]>('/flow/scopes');
  }

  getScope(id: string): Promise<FlowScope> {
    return this.client.get<FlowScope>(`/flow/scopes/${id}`);
  }

  createScope(input: Partial<FlowScope>): Promise<FlowScope> {
    return this.client.post<FlowScope>('/flow/scopes', input);
  }

  updateScope(id: string, input: Partial<FlowScope>): Promise<FlowScope> {
    return this.client.patch<FlowScope>(`/flow/scopes/${id}`, input);
  }

  deleteScope(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/scopes/${id}`);
  }

  listGraphs(scopeId?: string): Promise<FlowGraph[]> {
    return this.client.get<FlowGraph[]>('/flow/graphs', options({ scopeId }));
  }

  getGraph(id: string): Promise<FlowGraph> {
    return this.client.get<FlowGraph>(`/flow/graphs/${id}`);
  }

  exportGraph(id: string): Promise<FlowGraphExport> {
    return this.client.get<FlowGraphExport>(`/flow/graphs/${id}/export`);
  }

  importGraph(input: unknown): Promise<FlowGraphExport> {
    return this.client.post<FlowGraphExport>('/flow/graphs/import', input);
  }

  createGraph(input: Partial<FlowGraph>): Promise<FlowGraph> {
    return this.client.post<FlowGraph>('/flow/graphs', input);
  }

  updateGraph(id: string, input: Partial<FlowGraph>): Promise<FlowGraph> {
    return this.client.patch<FlowGraph>(`/flow/graphs/${id}`, input);
  }

  deleteGraph(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/graphs/${id}`);
  }

  listGraphNodes(graphId: string): Promise<FlowNode[]> {
    return this.client.get<FlowNode[]>(`/flow/graphs/${graphId}/nodes`);
  }

  createGraphNode(graphId: string, input: Partial<FlowNode>): Promise<FlowNode> {
    return this.client.post<FlowNode>(`/flow/graphs/${graphId}/nodes`, input);
  }

  updateNode(id: string, input: Partial<FlowNode>): Promise<FlowNode> {
    return this.client.patch<FlowNode>(`/flow/nodes/${id}`, input);
  }

  deleteNode(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/nodes/${id}`);
  }

  listGraphEdges(graphId: string): Promise<FlowEdge[]> {
    return this.client.get<FlowEdge[]>(`/flow/graphs/${graphId}/edges`);
  }

  createGraphEdge(graphId: string, input: Partial<FlowEdge>): Promise<FlowEdge> {
    return this.client.post<FlowEdge>(`/flow/graphs/${graphId}/edges`, input);
  }

  updateEdge(id: string, input: Partial<FlowEdge>): Promise<FlowEdge> {
    return this.client.patch<FlowEdge>(`/flow/edges/${id}`, input);
  }

  deleteEdge(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/edges/${id}`);
  }

  listNodeAgentRules(nodeId: string): Promise<FlowAgentRule[]> {
    return this.client.get<FlowAgentRule[]>(`/flow/nodes/${nodeId}/agent-rules`);
  }

  createNodeAgentRule(nodeId: string, input: Partial<FlowAgentRule>): Promise<FlowAgentRule> {
    return this.client.post<FlowAgentRule>(`/flow/nodes/${nodeId}/agent-rules`, input);
  }

  updateAgentRule(id: string, input: Partial<FlowAgentRule>): Promise<FlowAgentRule> {
    return this.client.patch<FlowAgentRule>(`/flow/agent-rules/${id}`, input);
  }

  deleteAgentRule(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/agent-rules/${id}`);
  }

  listNodeFormRules(nodeId: string): Promise<FlowNodeFormRule[]> {
    return this.client.get<FlowNodeFormRule[]>(`/flow/nodes/${nodeId}/form-rules`);
  }

  createNodeFormRule(nodeId: string, input: Partial<FlowNodeFormRule>): Promise<FlowNodeFormRule> {
    return this.client.post<FlowNodeFormRule>(`/flow/nodes/${nodeId}/form-rules`, input);
  }

  updateNodeFormRule(id: string, input: Partial<FlowNodeFormRule>): Promise<FlowNodeFormRule> {
    return this.client.patch<FlowNodeFormRule>(`/flow/node-form-rules/${id}`, input);
  }

  deleteNodeFormRule(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/node-form-rules/${id}`);
  }

  listGraphTransitionEffects(graphId: string): Promise<FlowTransitionEffect[]> {
    return this.client.get<FlowTransitionEffect[]>(`/flow/graphs/${graphId}/transition-effects`);
  }

  createGraphTransitionEffect(graphId: string, input: Partial<FlowTransitionEffect>): Promise<FlowTransitionEffect> {
    return this.client.post<FlowTransitionEffect>(`/flow/graphs/${graphId}/transition-effects`, input);
  }

  updateTransitionEffect(id: string, input: Partial<FlowTransitionEffect>): Promise<FlowTransitionEffect> {
    return this.client.patch<FlowTransitionEffect>(`/flow/transition-effects/${id}`, input);
  }

  deleteTransitionEffect(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/transition-effects/${id}`);
  }

  listRuns(filters: { scopeId?: string; graphId?: string; targetType?: string; targetId?: string; status?: string } = {}): Promise<FlowPage<FlowRun>> {
    return this.client.get<FlowPage<FlowRun>>('/flow/runs', options(filters));
  }

  ensureRun(input: unknown): Promise<{ runId: string }> {
    return this.client.post<{ runId: string }>('/flow/runs/ensure', input);
  }

  getRun(id: string): Promise<FlowRun> {
    return this.client.get<FlowRun>(`/flow/runs/${id}`);
  }

  updateRun(id: string, input: Partial<FlowRun>): Promise<FlowRun> {
    return this.client.patch<FlowRun>(`/flow/runs/${id}`, input);
  }

  listRunNodeRuns(runId: string): Promise<FlowNodeRun[]> {
    return this.client.get<FlowNodeRun[]>(`/flow/runs/${runId}/nodes`);
  }

  listRunTasks(runId: string): Promise<FlowTask[]> {
    return this.client.get<FlowTask[]>(`/flow/runs/${runId}/tasks`);
  }

  listRunEvents(runId: string): Promise<FlowEvent[]> {
    return this.client.get<FlowEvent[]>(`/flow/runs/${runId}/events`);
  }

  getRunFacts(runId: string): Promise<Record<string, unknown>> {
    return this.client.get<Record<string, unknown>>(`/flow/runs/${runId}/facts`);
  }

  listNodeRuns(filters: { runId?: string; status?: string } = {}): Promise<FlowPage<FlowNodeRun>> {
    return this.client.get<FlowPage<FlowNodeRun>>('/flow/node-runs', options(filters));
  }

  getNodeRun(id: string): Promise<FlowNodeRun> {
    return this.client.get<FlowNodeRun>(`/flow/node-runs/${id}`);
  }

  listTasks(filters: { runId?: string; assigneeUserId?: string; status?: string; mine?: boolean } = {}): Promise<FlowPage<FlowTask>> {
    return this.client.get<FlowPage<FlowTask>>('/flow/tasks', options(filters));
  }

  getTask(id: string): Promise<FlowTask> {
    return this.client.get<FlowTask>(`/flow/tasks/${id}`);
  }

  taskCandidates(taskId: string): Promise<FlowTaskCandidate[]> {
    return this.client.get<FlowTaskCandidate[]>(`/flow/tasks/${taskId}/candidates`);
  }

  usersByRole(role: string, search?: string): Promise<FlowTaskUser[]> {
    return this.client.get<FlowTaskUser[]>(`/flow/tasks/roles/${role}/users`, options({ search }));
  }

  taskUser(id: string): Promise<FlowTaskUser> {
    return this.client.get<FlowTaskUser>(`/flow/tasks/users/${id}`);
  }

  actTask(taskId: string, action: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/act`, { action, note });
  }

  acceptTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/accept`, { note });
  }

  declineTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/decline`, { note });
  }

  unacceptTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/unaccept`, { note });
  }

  withdrawTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/withdraw`, { note });
  }

  assignTask(taskId: string, userId: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/assign`, { userId, note });
  }

  unassignTask(taskId: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/unassign`, { note });
  }

  listForms(scopeId?: string): Promise<FlowForm[]> {
    return this.client.get<FlowForm[]>('/flow/forms', options({ scopeId }));
  }

  getForm(id: string): Promise<FlowForm> {
    return this.client.get<FlowForm>(`/flow/forms/${id}`);
  }

  createForm(input: Partial<FlowForm>): Promise<FlowForm> {
    return this.client.post<FlowForm>('/flow/forms', input);
  }

  updateForm(id: string, input: Partial<FlowForm>): Promise<FlowForm> {
    return this.client.patch<FlowForm>(`/flow/forms/${id}`, input);
  }

  deleteForm(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/forms/${id}`);
  }

  listQuestions(formId: string): Promise<FlowQuestion[]> {
    return this.client.get<FlowQuestion[]>(`/flow/forms/${formId}/questions`);
  }

  createQuestion(formId: string, input: Partial<FlowQuestion>): Promise<FlowQuestion> {
    return this.client.post<FlowQuestion>(`/flow/forms/${formId}/questions`, input);
  }

  updateQuestion(id: string, input: Partial<FlowQuestion>): Promise<FlowQuestion> {
    return this.client.patch<FlowQuestion>(`/flow/questions/${id}`, input);
  }

  deleteQuestion(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/questions/${id}`);
  }

  getQuestionScore(questionId: string): Promise<FlowScore> {
    return this.client.get<FlowScore>(`/flow/questions/${questionId}/score`);
  }

  putQuestionScore(questionId: string, input: Partial<FlowScore>): Promise<FlowScore> {
    return this.client.put<FlowScore>(`/flow/questions/${questionId}/score`, input);
  }

  deleteQuestionScore(questionId: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/questions/${questionId}/score`);
  }

  listFills(filters: { formId?: string; scopeId?: string; runId?: string; taskId?: string; targetId?: string; targetType?: string } = {}): Promise<FlowFill[]> {
    return this.client.get<FlowFill[]>('/flow/fills', options(filters));
  }

  getFill(id: string): Promise<FlowFill> {
    return this.client.get<FlowFill>(`/flow/fills/${id}`);
  }

  getFormFill(formId: string, fillId: string): Promise<FlowFill> {
    return this.client.get<FlowFill>(`/flow/forms/${formId}/fills/${fillId}`);
  }

  createFill(formId: string, input: Partial<FlowFill>): Promise<FlowFill> {
    return this.client.post<FlowFill>(`/flow/forms/${formId}/fills`, input);
  }

  createFillAlias(input: Partial<FlowFill> & { formId: string }): Promise<FlowFill> {
    return this.client.post<FlowFill>('/flow/fills', input);
  }

  updateFill(id: string, input: Partial<FlowFill>): Promise<FlowFill> {
    return this.client.patch<FlowFill>(`/flow/fills/${id}`, input);
  }

  deleteFill(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/fills/${id}`);
  }

  listAnswers(fillId: string): Promise<FlowAnswer[]> {
    return this.client.get<FlowAnswer[]>(`/flow/fills/${fillId}/answers`);
  }

  listFormFillAnswers(formId: string, fillId: string): Promise<FlowAnswer[]> {
    return this.client.get<FlowAnswer[]>(`/flow/forms/${formId}/fills/${fillId}/answers`);
  }

  upsertAnswer(fillId: string, input: Partial<FlowAnswer>): Promise<FlowAnswer> {
    return this.client.post<FlowAnswer>(`/flow/fills/${fillId}/answers`, input);
  }

  bulkUpsertAnswers(fillId: string, input: Array<Partial<FlowAnswer>>): Promise<FlowAnswer[]> {
    return this.client.put<FlowAnswer[]>(`/flow/fills/${fillId}/answers`, input);
  }

  updateAnswer(id: string, input: Partial<FlowAnswer>): Promise<FlowAnswer> {
    return this.client.patch<FlowAnswer>(`/flow/answers/${id}`, input);
  }

  deleteAnswer(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/answers/${id}`);
  }

  listWaivers(filters: { scopeId?: string; formId?: string; questionId?: string; targetId?: string; targetType?: string } = {}): Promise<FlowWaiver[]> {
    return this.client.get<FlowWaiver[]>('/flow/waivers', options(filters));
  }

  createWaiver(input: Partial<FlowWaiver>): Promise<FlowWaiver> {
    return this.client.post<FlowWaiver>('/flow/waivers', input);
  }

  listFormFillWaivers(formId: string, fillId: string): Promise<FlowWaiver[]> {
    return this.client.get<FlowWaiver[]>(`/flow/forms/${formId}/fills/${fillId}/waivers`);
  }

  listFillWaivers(fillId: string): Promise<FlowWaiver[]> {
    return this.client.get<FlowWaiver[]>(`/flow/fills/${fillId}/waivers`);
  }

  createFormFillWaiver(formId: string, fillId: string, input: Partial<FlowWaiver>): Promise<FlowWaiver> {
    return this.client.post<FlowWaiver>(`/flow/forms/${formId}/fills/${fillId}/waivers`, input);
  }

  updateWaiver(id: string, input: Partial<FlowWaiver>): Promise<FlowWaiver> {
    return this.client.patch<FlowWaiver>(`/flow/waivers/${id}`, input);
  }

  deleteWaiver(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/waivers/${id}`);
  }

  listEvents(filters: { runId?: string; nodeId?: string; taskId?: string; kind?: string; actorId?: string } = {}): Promise<FlowPage<FlowEvent>> {
    return this.client.get<FlowPage<FlowEvent>>('/flow/events', options(filters));
  }

  signal(input: unknown): Promise<Record<string, unknown>> {
    return this.client.post<Record<string, unknown>>('/flow/signal', input);
  }

  dispatchEffects(input: unknown): Promise<FlowEffectDispatchSummary> {
    return this.client.post<FlowEffectDispatchSummary>('/flow/effects/dispatch', input);
  }

  openTasks(filters: { scopeId?: string; scopeCode?: string; graphId?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<FlowPage<FlowOpenTask>> {
    return this.client.get<FlowPage<FlowOpenTask>>('/flow/open-tasks', options(filters));
  }

  runsSummary(filters: { scopeId?: string; scopeCode?: string; graphId?: string; status?: string; page?: number; pageSize?: number } = {}): Promise<FlowPage<FlowRunSummary>> {
    return this.client.get<FlowPage<FlowRunSummary>>('/flow/runs/summary', options(filters));
  }

  listPolicySets(scopeId?: string): Promise<FlowPolicySet[]> {
    return this.client.get<FlowPolicySet[]>('/flow/policies/sets', options({ scopeId }));
  }

  getPolicySet(id: string): Promise<FlowPolicySet> {
    return this.client.get<FlowPolicySet>(`/flow/policies/sets/${id}`);
  }

  createPolicySet(input: Partial<FlowPolicySet>): Promise<FlowPolicySet> {
    return this.client.post<FlowPolicySet>('/flow/policies/sets', input);
  }

  updatePolicySet(id: string, input: Partial<FlowPolicySet>): Promise<FlowPolicySet> {
    return this.client.patch<FlowPolicySet>(`/flow/policies/sets/${id}`, input);
  }

  deletePolicySet(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/policies/sets/${id}`);
  }

  listPolicyRules(policySetId: string): Promise<FlowPolicyRule[]> {
    return this.client.get<FlowPolicyRule[]>(`/flow/policies/sets/${policySetId}/rules`);
  }

  getPolicyRule(id: string): Promise<FlowPolicyRule> {
    return this.client.get<FlowPolicyRule>(`/flow/policies/rules/${id}`);
  }

  createPolicyRule(policySetId: string, input: Partial<FlowPolicyRule>): Promise<FlowPolicyRule> {
    return this.client.post<FlowPolicyRule>(`/flow/policies/sets/${policySetId}/rules`, input);
  }

  updatePolicyRule(id: string, input: Partial<FlowPolicyRule>): Promise<FlowPolicyRule> {
    return this.client.patch<FlowPolicyRule>(`/flow/policies/rules/${id}`, input);
  }

  deletePolicyRule(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.client.delete<{ id: string; deleted: boolean }>(`/flow/policies/rules/${id}`);
  }

  evaluatePolicy(input: unknown): Promise<FlowPolicyDecision> {
    return this.client.post<FlowPolicyDecision>('/flow/policies/evaluate', input);
  }
}
