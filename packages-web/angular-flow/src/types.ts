export type FlowNodeKind = 'human' | 'auto' | 'system' | 'start' | 'end' | 'gateway';
export type FlowDecisionPolicy = 'all' | 'any' | 'quorum';
export type FlowRunStatus = 'active' | 'completed' | 'canceled';
export type FlowTaskStatus = 'open' | 'completed' | 'canceled';
export type FlowFieldType =
  | 'boolean'
  | 'string'
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'file'
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
  isActive: boolean;
  name?: string;
  description?: string;
  meta?: Record<string, unknown>;
}

export interface FlowNode {
  id: string;
  graphId: string;
  code: string;
  name?: string;
  kind: FlowNodeKind;
  decisionPolicy?: FlowDecisionPolicy;
  quorumRatio?: string;
  allowedActions?: string[];
  entryRule?: string;
  exitRule?: string;
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
  action?: string;
  rule?: string;
  spawn?: boolean;
  sortOrder?: number;
  meta?: Record<string, unknown>;
}

export interface FlowAgentRule {
  id: string;
  nodeId: string;
  ruleType: 'permission' | 'user' | 'resolver_fn';
  permissionKey?: string;
  userId?: string;
  resolverKey?: string;
  params?: Record<string, unknown>;
  sortOrder?: number;
}

export interface FlowTransitionEffect {
  id: string;
  graphId: string;
  nodeCode?: string;
  action?: string;
  effectKey: string;
  payload?: Record<string, unknown>;
  sortOrder?: number;
}

export interface FlowNodeFormRule {
  id: string;
  nodeId: string;
  formId: string;
  required: boolean;
  gatingMode: 'all_required' | 'any' | 'threshold';
  threshold?: string;
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
  nodeName?: string;
  kind?: FlowNodeKind;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'canceled';
}

export interface FlowTask {
  id: string;
  runId: string;
  nodeRunId: string;
  nodeId: string;
  nodeCode?: string;
  nodeName?: string;
  assigneeType: string;
  assigneeId?: string;
  assigneeUserId?: string;
  status: FlowTaskStatus;
  allowedActions: string[];
  decidedAction?: string;
  note?: string;
  dueAt?: string;
}

export interface FlowForm {
  id: string;
  scopeId: string;
  code: string;
  version: string;
  title: string;
  description?: string;
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
  options?: unknown[];
  validators?: Record<string, unknown>;
  visibleIf?: Record<string, unknown>;
  sortOrder?: number;
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
  runId?: string;
  nodeRunId?: string;
  taskId?: string;
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
  questionId?: string;
  reason: string;
  waivedBy?: string;
  expiresAt?: string;
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
  firstCreatedAt?: string;
  lastUpdatedAt?: string;
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
