export type FlowJsonObject = Record<string, unknown>;
export type FlowNodeKind = 'human' | 'auto' | 'system' | 'start' | 'end' | 'gateway';
export type FlowDecisionPolicy = 'all' | 'any' | 'quorum';
export type FlowAgentRuleType = 'permission' | 'user' | 'resolver_fn';
export type FlowNodeFormGatingMode = 'all_required' | 'any' | 'threshold' | 'any_answered' | 'score_threshold';
export type FlowPolicyEffect = 'allow' | 'deny';
export type FlowRunStatus = 'active' | 'completed' | 'canceled';
export type FlowQuestionFieldType =
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
export type FlowFillStatus = 'draft' | 'submitted' | 'void';

export interface CreateFlowScopeDto {
  code: string;
  label: string;
  adapterKey: string;
  adapterConfig?: FlowJsonObject;
  meta?: FlowJsonObject;
}

export interface UpdateFlowScopeDto {
  code?: string;
  label?: string;
  adapterKey?: string;
  adapterConfig?: FlowJsonObject;
  meta?: FlowJsonObject;
}

export interface CreateFlowGraphDto {
  scopeId: string;
  code: string;
  version?: string;
  isActive?: boolean;
  name?: string;
  description?: string;
  meta?: FlowJsonObject;
}

export interface UpdateFlowGraphDto {
  code?: string;
  version?: string;
  isActive?: boolean;
  name?: string;
  description?: string;
  meta?: FlowJsonObject;
}

export interface PublishFlowGraphDto {
  expectedDraftVersion?: string;
  notes?: string;
}

export interface CreateFlowNodeDto {
  graphId: string;
  code: string;
  name?: string;
  kind: FlowNodeKind;
  decisionPolicy?: FlowDecisionPolicy;
  quorumRatio?: string;
  allowedActions?: string[];
  slaSeconds?: number;
  entryRule?: string;
  exitRule?: string;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface UpdateFlowNodeDto {
  code?: string;
  name?: string;
  kind?: FlowNodeKind;
  decisionPolicy?: FlowDecisionPolicy;
  quorumRatio?: string;
  allowedActions?: string[];
  slaSeconds?: number;
  entryRule?: string;
  exitRule?: string;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface CreateFlowEdgeDto {
  graphId: string;
  fromNodeId: string;
  toNodeId: string;
  action?: string;
  rule?: string;
  spawn?: boolean;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface UpdateFlowEdgeDto {
  fromNodeId?: string;
  toNodeId?: string;
  action?: string;
  rule?: string;
  spawn?: boolean;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface CreateFlowAgentRuleDto {
  nodeId: string;
  ruleType: FlowAgentRuleType;
  permissionKey?: string;
  userId?: string;
  resolverKey?: string;
  params?: FlowJsonObject;
  sortOrder?: number;
}

export interface UpdateFlowAgentRuleDto {
  ruleType?: FlowAgentRuleType;
  permissionKey?: string;
  userId?: string;
  resolverKey?: string;
  params?: FlowJsonObject;
  sortOrder?: number;
}

export interface CreateFlowTransitionEffectDto {
  graphId: string;
  nodeCode?: string;
  action?: string;
  effectKey: string;
  payload?: FlowJsonObject;
  sortOrder?: number;
}

export interface UpdateFlowTransitionEffectDto {
  nodeCode?: string;
  action?: string;
  effectKey?: string;
  payload?: FlowJsonObject;
  sortOrder?: number;
}

export interface CreateFlowNodeFormRuleDto {
  nodeId: string;
  formId: string;
  required?: boolean;
  gatingMode?: FlowNodeFormGatingMode;
  threshold?: string;
  applicability?: FlowJsonObject;
  weight?: string;
  meta?: FlowJsonObject;
}

export interface UpdateFlowNodeFormRuleDto {
  required?: boolean;
  gatingMode?: FlowNodeFormGatingMode;
  threshold?: string;
  applicability?: FlowJsonObject;
  weight?: string;
  meta?: FlowJsonObject;
}

export interface CreateFlowPolicySetDto {
  scopeId: string;
  version: string;
  isActive?: boolean;
  name?: string;
  description?: string;
  meta?: FlowJsonObject;
}

export interface UpdateFlowPolicySetDto {
  version?: string;
  isActive?: boolean;
  name?: string;
  description?: string;
  meta?: FlowJsonObject;
}

export interface CreateFlowPolicyRuleDto {
  policySetId: string;
  nodeCode?: string;
  statusCode?: string;
  action?: string;
  capability?: string;
  effect: FlowPolicyEffect;
  priority?: number;
  reasonCode?: string;
  conditions?: FlowJsonObject;
  meta?: FlowJsonObject;
}

export interface UpdateFlowPolicyRuleDto {
  nodeCode?: string;
  statusCode?: string;
  action?: string;
  capability?: string;
  effect?: FlowPolicyEffect;
  priority?: number;
  reasonCode?: string;
  conditions?: FlowJsonObject;
  meta?: FlowJsonObject;
}

export interface EnsureFlowRunDto {
  graphCode: string;
  version?: string;
  scopeCode?: string;
  scopeId?: string;
  adapterKey?: string;
  targetType?: string;
  targetId: string;
  signalKey?: string;
  payload?: FlowJsonObject;
}

export interface UpdateFlowRunDto {
  status: FlowRunStatus;
}

export interface FlowTaskActionDto {
  action: string;
  note?: string;
  payload?: FlowJsonObject | null;
}

export interface FlowTaskAssignmentDto {
  userId: string;
  note?: string;
}

export interface FlowTaskNoteDto {
  note?: string;
}

export interface FlowSignalDto {
  scopeId?: string;
  scopeCode?: string;
  adapterKey?: string;
  targetType?: string;
  targetId: string;
  signalKey?: string;
  payload?: FlowJsonObject;
}

export interface DispatchFlowEffectsDto {
  runId?: string;
  effectEventId?: string;
  limit?: number;
  reason?: string;
}

export interface CreateFlowFormDto {
  scopeId: string;
  code: string;
  version?: string;
  title: string;
  description?: string;
  isActive?: boolean;
  meta?: FlowJsonObject;
}

export interface UpdateFlowFormDto {
  code?: string;
  version?: string;
  title?: string;
  description?: string;
  isActive?: boolean;
  meta?: FlowJsonObject;
}

export interface CreateFlowQuestionDto {
  formId: string;
  key: string;
  label: string;
  fieldType: FlowQuestionFieldType;
  required?: boolean;
  blocksSubmit?: boolean;
  options?: unknown[];
  validators?: FlowJsonObject;
  visibleIf?: FlowJsonObject;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface UpdateFlowQuestionDto {
  key?: string;
  label?: string;
  fieldType?: FlowQuestionFieldType;
  required?: boolean;
  blocksSubmit?: boolean;
  options?: unknown[];
  validators?: FlowJsonObject;
  visibleIf?: FlowJsonObject;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface PutFlowQuestionScoreDto {
  passPoints?: string;
  failPoints?: string;
  meta?: FlowJsonObject;
}

export interface CreateFlowFillDto {
  formId: string;
  scopeId: string;
  runId?: string;
  nodeRunId?: string;
  taskId?: string;
  targetType: string;
  targetId: string;
  status?: FlowFillStatus;
}

export interface UpdateFlowFillDto {
  runId?: string;
  nodeRunId?: string;
  taskId?: string;
  status?: FlowFillStatus;
}

export interface FlowAnswerWriteDto {
  questionId?: string;
  itemId?: string;
  value?: unknown;
  attachment?: unknown;
}

export interface BulkFlowAnswerWriteDto {
  answers: FlowAnswerWriteDto[];
}

export type BulkFlowAnswerWriteRequestDto = FlowAnswerWriteDto[] | BulkFlowAnswerWriteDto;

export interface UpdateFlowAnswerDto {
  questionId?: string;
  itemId?: string;
  value?: unknown;
  attachment?: unknown;
}

export interface CreateFlowWaiverDto {
  scopeId: string;
  targetType: string;
  targetId: string;
  formId: string;
  questionId?: string;
  reason: string;
  waivedBy?: string;
  expiresAt?: string;
}

export interface UpdateFlowWaiverDto {
  scopeId?: string;
  targetType?: string;
  targetId?: string;
  formId?: string;
  questionId?: string;
  reason?: string;
  waivedBy?: string;
  expiresAt?: string;
}

export interface FlowPolicyEvaluationDto {
  scopeId?: string;
  scopeCode?: string;
  policySetId?: string;
  nodeCode?: string;
  statusCode?: string;
  action?: string;
  capability?: string;
  facts?: FlowJsonObject;
  targetType?: string;
  targetId?: string;
}

export interface FlowGraphImportNode {
  code: string;
  name?: string;
  kind: string;
  decisionPolicy?: string;
  quorumRatio?: string;
  allowedActions?: string[];
  slaSeconds?: number;
  entryRule?: string;
  exitRule?: string;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface FlowGraphImportEdge {
  fromNodeCode: string;
  toNodeCode: string;
  action?: string;
  rule?: string;
  spawn?: boolean;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface FlowGraphImportDocument {
  graph: FlowJsonObject;
  nodes: FlowGraphImportNode[];
  edges?: FlowGraphImportEdge[];
  transitionEffects?: FlowJsonObject[];
  agentRules?: Array<FlowJsonObject & { nodeCode: string }>;
  nodeFormRules?: Array<FlowJsonObject & { nodeCode: string }>;
}

export interface FlowGraphExportDocument {
  graph: FlowJsonObject;
  nodes: FlowJsonObject[];
  edges: FlowJsonObject[];
  transitionEffects: FlowJsonObject[];
  agentRules: FlowJsonObject[];
  nodeFormRules: FlowJsonObject[];
  policySets: FlowJsonObject[];
  policyRules: FlowJsonObject[];
}

export interface FlowDesignListOptions {
  scopeId?: string;
  graphId?: string;
  nodeId?: string;
  policySetId?: string;
}
