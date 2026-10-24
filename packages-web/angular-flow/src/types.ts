export type FlowNodeKind = 'human' | 'auto' | 'system' | 'start' | 'end' | 'gateway';
export type FlowDecisionPolicy = 'all' | 'any' | 'quorum';
export type FlowGraphStatus = 'draft' | 'published';
export type FlowRunStatus = 'active' | 'completed' | 'canceled';
export type FlowTaskStatus = 'open' | 'completed' | 'canceled' | 'expired';
export type FlowFieldType =
  | 'boolean'
  | 'string'
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'file'
  | 'signature'
  | 'url'
  | 'cnpj'
  | 'email';

export interface FlowPage<TItem> {
  data: TItem[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface FlowScope {
  id: string;
  code: string;
  label: string;
  adapterKey: string;
  adapterConfig?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface FlowGraph {
  id: string;
  scopeId: string;
  code: string;
  version: string;
  status: FlowGraphStatus;
  publishedVersion?: number;
  publishedAt?: string;
  publishedBy?: string | null;
  isActive: boolean;
  name?: string | null;
  description?: string | null;
  meta?: Record<string, unknown>;
}

export interface PublishFlowGraphRequest {
  expectedDraftVersion?: string;
  notes?: string;
}

export interface PublishFlowGraphResponse {
  graphId: string;
  status: 'published';
  draftVersion: string;
  publishedVersion: number;
  publishedAt: string;
  publishedBy?: string | null;
  runtimeGraphRef: {
    graphId: string;
    version: number;
  };
}

export interface FlowNode {
  id: string;
  graphId: string;
  code: string;
  name?: string | null;
  kind: FlowNodeKind;
  decisionPolicy?: FlowDecisionPolicy;
  quorumRatio?: string | null;
  allowedActions?: string[];
  entryRule?: string | null;
  exitRule?: string | null;
  sortOrder?: number;
  meta?: Record<string, unknown>;
}

export interface FlowEdge {
  id: string;
  graphId: string;
  fromNodeId: string;
  toNodeId: string;
  fromNodeCode?: string;
  toNodeCode?: string;
  action?: string | null;
  rule?: string | null;
  spawn?: boolean;
  sortOrder?: number;
  meta?: Record<string, unknown>;
}

export interface FlowAgentRule {
  id: string;
  nodeId: string;
  ruleType: 'permission' | 'user' | 'resolver_fn';
  permissionKey?: string | null;
  userId?: string | null;
  resolverKey?: string | null;
  params?: Record<string, unknown>;
  sortOrder?: number;
}

export interface FlowTransitionEffect {
  id: string;
  graphId: string;
  nodeCode?: string | null;
  action?: string | null;
  effectKey: string;
  payload?: Record<string, unknown>;
  sortOrder?: number;
}

export interface FlowNodeFormRule {
  id: string;
  nodeId: string;
  formId: string;
  required: boolean;
  gatingMode: 'all_required' | 'any' | 'threshold' | 'any_answered' | 'score_threshold';
  threshold?: string | null;
  applicability?: Record<string, unknown>;
  weight?: string;
  meta?: Record<string, unknown>;
}

export interface FlowRun {
  id: string;
  scopeId: string;
  graphId: string;
  adapterKey?: string;
  targetType: string;
  targetId: string;
  status: FlowRunStatus;
}

export interface FlowNodeRun {
  id: string;
  runId: string;
  nodeId: string;
  nodeCode?: string;
  nodeName?: string | null;
  kind?: FlowNodeKind;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'canceled';
}

export interface FlowTask {
  id: string;
  runId: string;
  nodeRunId: string;
  nodeId: string;
  nodeCode?: string;
  nodeName?: string | null;
  assigneeType: string;
  assigneeId?: string | null;
  assigneeUserId?: string | null;
  status: FlowTaskStatus;
  allowedActions: string[];
  decidedAction?: string | null;
  note?: string | null;
  dueAt?: string | null;
}

export interface FlowForm {
  id: string;
  scopeId: string;
  code: string;
  version: string;
  title: string;
  description?: string | null;
  isActive: boolean;
  meta?: Record<string, unknown>;
}

export interface FlowQuestion {
  id: string;
  formId: string;
  key: string;
  label: string;
  fieldType: FlowFieldType;
  required: boolean;
  blocksSubmit: boolean;
  options?: unknown[] | Record<string, unknown>;
  validators?: Record<string, unknown>;
  visibleIf?: Record<string, unknown>;
  revealIf?: FlowQuestionRevealCondition;
  sortOrder?: number;
}

export interface FlowQuestionRevealCondition {
  question: string;
  equals: unknown;
}

export interface FlowScore {
  id: string;
  questionId: string;
  passPoints: string;
  failPoints: string;
  meta?: Record<string, unknown>;
}

export interface FlowFill {
  id: string;
  formId: string;
  scopeId: string;
  runId?: string | null;
  nodeRunId?: string | null;
  taskId?: string | null;
  targetType: string;
  targetId: string;
  status: 'draft' | 'submitted' | 'void';
}

export interface FlowAnswer {
  id: string;
  fillId: string;
  questionId: string;
  value?: unknown;
  attachment?: unknown;
}

export interface FlowWaiver {
  id: string;
  scopeId: string;
  targetType: string;
  targetId: string;
  formId: string;
  questionId?: string | null;
  reason: string;
  waivedBy?: string | null;
  expiresAt?: string | null;
}

export interface FlowOpenTask extends FlowTask {
  targetType: string;
  targetId: string;
}

export interface FlowRunSummary {
  scopeId: string;
  graphId: string;
  status: FlowRunStatus;
  runCount: number;
  firstCreatedAt?: string | null;
  lastUpdatedAt?: string | null;
}

export interface FlowDashboardAnalytics {
  openTasks: number;
  cycleTime: {
    p50Seconds: number;
    p95Seconds: number;
  };
  completionRate: {
    last7Days: number;
    last30Days: number;
  };
  slaBreaches: number;
}

export interface FlowEvent {
  id: string;
  runId: string;
  nodeId?: string | null;
  taskId?: string | null;
  kind: string;
  actorId?: string | null;
  note?: string | null;
  facts?: Record<string, unknown> | null;
  payload?: Record<string, unknown>;
  createdAt?: string | null;
}

export type FlowRunActivityEvent = FlowEvent;

export interface FlowTaskCandidate {
  agentType: 'user' | 'permission' | 'resolver';
  agentId: string;
  ruleId?: string;
  label?: string;
  resolverKey?: string;
  unresolved?: boolean;
}

export interface FlowTaskUser {
  id: string;
  email?: string;
  externalSubject?: string | null;
  locale?: string | null;
}

export interface FlowPolicySet {
  id: string;
  scopeId: string;
  version: string;
  isActive: boolean;
  name?: string | null;
  description?: string | null;
  meta?: Record<string, unknown>;
}

export interface FlowPolicyRule {
  id: string;
  policySetId: string;
  nodeCode?: string | null;
  statusCode?: string | null;
  action?: string | null;
  capability?: string | null;
  effect: 'allow' | 'deny';
  priority?: number;
  reasonCode?: string | null;
  conditions?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface FlowPolicyDecision {
  allowed: boolean;
  effect: 'allow' | 'deny';
  reasonCode?: string | null;
  matchedRuleId?: string | null;
  defaulted: boolean;
}

export interface FlowEffectDispatchSummary {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  diagnostics: Array<Record<string, unknown>>;
}

export interface FlowGraphExport {
  graph: FlowGraph;
  nodes: FlowNode[];
  edges: FlowEdge[];
  transitionEffects: FlowTransitionEffect[];
  agentRules: FlowAgentRule[];
  nodeFormRules: FlowNodeFormRule[];
  policySets: Record<string, unknown>[];
  policyRules: Record<string, unknown>[];
}

/** Write inputs retain the original optional, non-null field domains. */
export type FlowGraphInput = Partial<Omit<FlowGraph, 'name' | 'description'> & {
  name?: string;
  description?: string;
}>;

export type FlowNodeInput = Partial<Omit<FlowNode, 'name' | 'quorumRatio' | 'entryRule' | 'exitRule'> & {
  name?: string;
  quorumRatio?: string;
  entryRule?: string;
  exitRule?: string;
}>;

export type FlowEdgeInput = Partial<Omit<FlowEdge, 'action' | 'rule'> & {
  action?: string;
  rule?: string;
}>;

export type FlowAgentRuleInput = Partial<Omit<FlowAgentRule, 'permissionKey' | 'userId' | 'resolverKey'> & {
  permissionKey?: string;
  userId?: string;
  resolverKey?: string;
}>;

export type FlowTransitionEffectInput = Partial<Omit<FlowTransitionEffect, 'nodeCode' | 'action'> & {
  nodeCode?: string;
  action?: string;
}>;

export type FlowNodeFormRuleInput = Partial<Omit<FlowNodeFormRule, 'threshold'> & {
  threshold?: string;
}>;

export type FlowFormInput = Partial<Omit<FlowForm, 'description'> & {
  description?: string;
}>;

export type FlowFillInput = Partial<Omit<FlowFill, 'runId' | 'nodeRunId' | 'taskId'> & {
  runId?: string;
  nodeRunId?: string;
  taskId?: string;
}>;

export type FlowWaiverInput = Partial<Omit<FlowWaiver, 'questionId' | 'waivedBy' | 'expiresAt'> & {
  questionId?: string;
  waivedBy?: string;
  expiresAt?: string;
}>;

export type FlowPolicySetInput = Partial<Omit<FlowPolicySet, 'name' | 'description'> & {
  name?: string;
  description?: string;
}>;

export type FlowPolicyRuleInput = Partial<Omit<FlowPolicyRule, 'nodeCode' | 'statusCode' | 'action' | 'capability' | 'reasonCode'> & {
  nodeCode?: string;
  statusCode?: string;
  action?: string;
  capability?: string;
  reasonCode?: string;
}>;
