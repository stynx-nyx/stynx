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
  FlowQuestion,
  FlowRun,
  FlowRunSummary,
  FlowScope,
  FlowScore,
  FlowTask,
  FlowTransitionEffect,
  FlowWaiver,
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

  createScope(input: Partial<FlowScope>): Promise<FlowScope> {
    return this.client.post<FlowScope>('/flow/scopes', input);
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

  listGraphNodes(graphId: string): Promise<FlowNode[]> {
    return this.client.get<FlowNode[]>(`/flow/graphs/${graphId}/nodes`);
  }

  createGraphNode(graphId: string, input: Partial<FlowNode>): Promise<FlowNode> {
    return this.client.post<FlowNode>(`/flow/graphs/${graphId}/nodes`, input);
  }

  updateNode(id: string, input: Partial<FlowNode>): Promise<FlowNode> {
    return this.client.patch<FlowNode>(`/flow/nodes/${id}`, input);
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

  listNodeAgentRules(nodeId: string): Promise<FlowAgentRule[]> {
    return this.client.get<FlowAgentRule[]>(`/flow/nodes/${nodeId}/agent-rules`);
  }

  listNodeFormRules(nodeId: string): Promise<FlowNodeFormRule[]> {
    return this.client.get<FlowNodeFormRule[]>(`/flow/nodes/${nodeId}/form-rules`);
  }

  listGraphTransitionEffects(graphId: string): Promise<FlowTransitionEffect[]> {
    return this.client.get<FlowTransitionEffect[]>(`/flow/graphs/${graphId}/transition-effects`);
  }

  listRuns(filters: { scopeId?: string; graphId?: string; targetType?: string; targetId?: string; status?: string } = {}): Promise<FlowPage<FlowRun>> {
    return this.client.get<FlowPage<FlowRun>>('/flow/runs', options(filters));
  }

  ensureRun(input: unknown): Promise<{ runId: string }> {
    return this.client.post<{ runId: string }>('/flow/runs/ensure', input);
  }

  listRunNodeRuns(runId: string): Promise<FlowNodeRun[]> {
    return this.client.get<FlowNodeRun[]>(`/flow/runs/${runId}/nodes`);
  }

  listRunTasks(runId: string): Promise<FlowTask[]> {
    return this.client.get<FlowTask[]>(`/flow/runs/${runId}/tasks`);
  }

  listTasks(filters: { runId?: string; assigneeUserId?: string; status?: string; mine?: boolean } = {}): Promise<FlowPage<FlowTask>> {
    return this.client.get<FlowPage<FlowTask>>('/flow/tasks', options(filters));
  }

  actTask(taskId: string, action: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/act`, { action, note });
  }

  assignTask(taskId: string, userId: string, note?: string): Promise<FlowTask> {
    return this.client.post<FlowTask>(`/flow/tasks/${taskId}/assign`, { userId, note });
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

  listQuestions(formId: string): Promise<FlowQuestion[]> {
    return this.client.get<FlowQuestion[]>(`/flow/forms/${formId}/questions`);
  }

  putQuestionScore(questionId: string, input: Partial<FlowScore>): Promise<FlowScore> {
    return this.client.put<FlowScore>(`/flow/questions/${questionId}/score`, input);
  }

  listFills(filters: { formId?: string; scopeId?: string; runId?: string; taskId?: string; targetId?: string; targetType?: string } = {}): Promise<FlowFill[]> {
    return this.client.get<FlowFill[]>('/flow/fills', options(filters));
  }

  getFill(id: string): Promise<FlowFill> {
    return this.client.get<FlowFill>(`/flow/fills/${id}`);
  }

  createFill(formId: string, input: Partial<FlowFill>): Promise<FlowFill> {
    return this.client.post<FlowFill>(`/flow/forms/${formId}/fills`, input);
  }

  listAnswers(fillId: string): Promise<FlowAnswer[]> {
    return this.client.get<FlowAnswer[]>(`/flow/fills/${fillId}/answers`);
  }

  upsertAnswer(fillId: string, input: Partial<FlowAnswer>): Promise<FlowAnswer> {
    return this.client.post<FlowAnswer>(`/flow/fills/${fillId}/answers`, input);
  }

  listWaivers(filters: { scopeId?: string; formId?: string; questionId?: string; targetId?: string; targetType?: string } = {}): Promise<FlowWaiver[]> {
    return this.client.get<FlowWaiver[]>('/flow/waivers', options(filters));
  }

  createWaiver(input: Partial<FlowWaiver>): Promise<FlowWaiver> {
    return this.client.post<FlowWaiver>('/flow/waivers', input);
  }

  openTasks(): Promise<FlowOpenTask[]> {
    return this.client.get<FlowOpenTask[]>('/flow/open-tasks');
  }

  runsSummary(): Promise<FlowRunSummary[]> {
    return this.client.get<FlowRunSummary[]>('/flow/runs/summary');
  }
}
