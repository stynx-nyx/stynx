import type { FlowScope, FlowGraph, PublishFlowGraphResponse, FlowNode, FlowEdge, FlowAgentRule, FlowTransitionEffect, FlowNodeFormRule, FlowRun, FlowNodeRun, FlowTask, FlowForm, FlowQuestion, FlowQuestionRevealCondition, FlowScore, FlowFill, FlowAnswer, FlowWaiver, FlowOpenTask, FlowRunSummary, FlowDashboardAnalytics, FlowEvent, FlowTaskCandidate, FlowTaskUser, FlowPolicySet, FlowPolicyRule, FlowPolicyDecision, FlowEffectDispatchSummary, FlowGraphExport, FlowNodeKind, FlowDecisionPolicy, FlowGraphStatus, FlowRunStatus, FlowTaskStatus, FlowFieldType, FlowRunActivityEvent, FlowPage } from './types';

/** Complete declared-field guards; returned values retain identity and unknown extensions. */
export type Guard<T> = (value: unknown) => value is T;
type Shape<T> = { [K in keyof T]-?: Guard<T[K]> };

export const string: Guard<string> = (value): value is string => typeof value === 'string';
export const number: Guard<number> = (value): value is number => typeof value === 'number';
export const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';
export const opaque: Guard<unknown> = (_value): _value is unknown => true;
export const record: Guard<Record<string, unknown>> = (value): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const nullValue: Guard<null> = (value): value is null => value === null;

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}
export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}
export function array<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!Array.isArray(value)) return false;
    for (let index = 0; index < value.length; index += 1) {
      const item: unknown = value[index];
      if (!guard(item)) return false;
    }
    return true;
  };
}
export function union<A, B>(left: Guard<A>, right: Guard<B>): Guard<A | B> {
  return (value): value is A | B => left(value) || right(value);
}
export function literals<const T extends string>(...values: readonly T[]): Guard<T> {
  return (value): value is T => values.some((candidate) => candidate === value);
}
export function object<T extends object>(shape: Shape<T>): Guard<T> {
  return (value): value is T => {
    if (!record(value)) return false;
    for (const key in shape) {
      if (!shape[key](value[key])) return false;
    }
    return true;
  };
}
export function decode<T>(guard: Guard<T>, name: string): (value: unknown) => T {
  return (value) => {
    if (!guard(value)) throw new TypeError(`Invalid ${name} response`);
    return value;
  };
}

export function isFlowScope(value: unknown): value is FlowScope {
  return object<FlowScope>({
    id: string,
    code: string,
    label: string,
    adapterKey: string,
    adapterConfig: optional(record),
    meta: optional(record),
  })(value);
}

export function isFlowGraph(value: unknown): value is FlowGraph {
  return object<FlowGraph>({
    id: string,
    scopeId: string,
    code: string,
    version: string,
    status: isFlowGraphStatus,
    publishedVersion: optional(number),
    publishedAt: optional(string),
    publishedBy: optional(nullable(string)),
    isActive: boolean,
    name: optional(nullable(string)),
    description: optional(nullable(string)),
    meta: optional(record),
  })(value);
}

export function isPublishFlowGraphResponse(value: unknown): value is PublishFlowGraphResponse {
  return object<PublishFlowGraphResponse>({
    graphId: string,
    status: literals('published'),
    draftVersion: string,
    publishedVersion: number,
    publishedAt: string,
    publishedBy: optional(nullable(string)),
    runtimeGraphRef: object<PublishFlowGraphResponse['runtimeGraphRef']>({ graphId: string, version: number }),
  })(value);
}

export function isFlowNode(value: unknown): value is FlowNode {
  return object<FlowNode>({
    id: string,
    graphId: string,
    code: string,
    name: optional(nullable(string)),
    kind: isFlowNodeKind,
    decisionPolicy: optional(isFlowDecisionPolicy),
    quorumRatio: optional(nullable(string)),
    allowedActions: optional(array(string)),
    entryRule: optional(nullable(string)),
    exitRule: optional(nullable(string)),
    sortOrder: optional(number),
    meta: optional(record),
  })(value);
}

export function isFlowEdge(value: unknown): value is FlowEdge {
  return object<FlowEdge>({
    id: string,
    graphId: string,
    fromNodeId: string,
    toNodeId: string,
    fromNodeCode: optional(string),
    toNodeCode: optional(string),
    action: optional(nullable(string)),
    rule: optional(nullable(string)),
    spawn: optional(boolean),
    sortOrder: optional(number),
    meta: optional(record),
  })(value);
}

export function isFlowAgentRule(value: unknown): value is FlowAgentRule {
  return object<FlowAgentRule>({
    id: string,
    nodeId: string,
    ruleType: literals('permission', 'user', 'resolver_fn'),
    permissionKey: optional(nullable(string)),
    userId: optional(nullable(string)),
    resolverKey: optional(nullable(string)),
    params: optional(record),
    sortOrder: optional(number),
  })(value);
}

export function isFlowTransitionEffect(value: unknown): value is FlowTransitionEffect {
  return object<FlowTransitionEffect>({
    id: string,
    graphId: string,
    nodeCode: optional(nullable(string)),
    action: optional(nullable(string)),
    effectKey: string,
    payload: optional(record),
    sortOrder: optional(number),
  })(value);
}

export function isFlowNodeFormRule(value: unknown): value is FlowNodeFormRule {
  return object<FlowNodeFormRule>({
    id: string,
    nodeId: string,
    formId: string,
    required: boolean,
    gatingMode: literals('all_required', 'any', 'threshold', 'any_answered', 'score_threshold'),
    threshold: optional(nullable(string)),
    applicability: optional(record),
    weight: optional(string),
    meta: optional(record),
  })(value);
}

export function isFlowRun(value: unknown): value is FlowRun {
  return object<FlowRun>({
    id: string,
    scopeId: string,
    graphId: string,
    adapterKey: optional(string),
    targetType: string,
    targetId: string,
    status: isFlowRunStatus,
  })(value);
}

export function isFlowNodeRun(value: unknown): value is FlowNodeRun {
  return object<FlowNodeRun>({
    id: string,
    runId: string,
    nodeId: string,
    nodeCode: optional(string),
    nodeName: optional(nullable(string)),
    kind: optional(isFlowNodeKind),
    status: literals('pending', 'in_progress', 'completed', 'skipped', 'canceled'),
  })(value);
}

export function isFlowTask(value: unknown): value is FlowTask {
  return object<FlowTask>({
    id: string,
    runId: string,
    nodeRunId: string,
    nodeId: string,
    nodeCode: optional(string),
    nodeName: optional(nullable(string)),
    assigneeType: string,
    assigneeId: optional(nullable(string)),
    assigneeUserId: optional(nullable(string)),
    status: isFlowTaskStatus,
    allowedActions: array(string),
    decidedAction: optional(nullable(string)),
    note: optional(nullable(string)),
    dueAt: optional(nullable(string)),
  })(value);
}

export function isFlowForm(value: unknown): value is FlowForm {
  return object<FlowForm>({
    id: string,
    scopeId: string,
    code: string,
    version: string,
    title: string,
    description: optional(nullable(string)),
    isActive: boolean,
    meta: optional(record),
  })(value);
}

export function isFlowQuestion(value: unknown): value is FlowQuestion {
  return object<FlowQuestion>({
    id: string,
    formId: string,
    key: string,
    label: string,
    fieldType: isFlowFieldType,
    required: boolean,
    blocksSubmit: boolean,
    options: optional(union(array(opaque), record)),
    validators: optional(record),
    visibleIf: optional(record),
    revealIf: optional(isFlowQuestionRevealCondition),
    sortOrder: optional(number),
  })(value);
}

export function isFlowQuestionRevealCondition(value: unknown): value is FlowQuestionRevealCondition {
  return object<FlowQuestionRevealCondition>({
    question: string,
    equals: opaque,
  })(value);
}

export function isFlowScore(value: unknown): value is FlowScore {
  return object<FlowScore>({
    id: string,
    questionId: string,
    passPoints: string,
    failPoints: string,
    meta: optional(record),
  })(value);
}

export function isFlowFill(value: unknown): value is FlowFill {
  return object<FlowFill>({
    id: string,
    formId: string,
    scopeId: string,
    runId: optional(nullable(string)),
    nodeRunId: optional(nullable(string)),
    taskId: optional(nullable(string)),
    targetType: string,
    targetId: string,
    status: literals('draft', 'submitted', 'void'),
  })(value);
}

export function isFlowAnswer(value: unknown): value is FlowAnswer {
  return object<FlowAnswer>({
    id: string,
    fillId: string,
    questionId: string,
    value: optional(opaque),
    attachment: optional(opaque),
  })(value);
}

export function isFlowWaiver(value: unknown): value is FlowWaiver {
  return object<FlowWaiver>({
    id: string,
    scopeId: string,
    targetType: string,
    targetId: string,
    formId: string,
    questionId: optional(nullable(string)),
    reason: string,
    waivedBy: optional(nullable(string)),
    expiresAt: optional(nullable(string)),
  })(value);
}

export function isFlowOpenTask(value: unknown): value is FlowOpenTask {
  return object<FlowOpenTask>({
    id: string,
    runId: string,
    nodeRunId: string,
    nodeId: string,
    nodeCode: optional(string),
    nodeName: optional(nullable(string)),
    assigneeType: string,
    assigneeId: optional(nullable(string)),
    assigneeUserId: optional(nullable(string)),
    status: isFlowTaskStatus,
    allowedActions: array(string),
    decidedAction: optional(nullable(string)),
    note: optional(nullable(string)),
    dueAt: optional(nullable(string)),
    targetType: string,
    targetId: string,
  })(value);
}

export function isFlowRunSummary(value: unknown): value is FlowRunSummary {
  return object<FlowRunSummary>({
    scopeId: string,
    graphId: string,
    status: isFlowRunStatus,
    runCount: number,
    firstCreatedAt: optional(nullable(string)),
    lastUpdatedAt: optional(nullable(string)),
  })(value);
}

export function isFlowDashboardAnalytics(value: unknown): value is FlowDashboardAnalytics {
  return object<FlowDashboardAnalytics>({
    openTasks: number,
    cycleTime: object<FlowDashboardAnalytics['cycleTime']>({ p50Seconds: number, p95Seconds: number }),
    completionRate: object<FlowDashboardAnalytics['completionRate']>({ last7Days: number, last30Days: number }),
    slaBreaches: number,
  })(value);
}

export function isFlowEvent(value: unknown): value is FlowEvent {
  return object<FlowEvent>({
    id: string,
    runId: string,
    nodeId: optional(nullable(string)),
    taskId: optional(nullable(string)),
    kind: string,
    actorId: optional(nullable(string)),
    note: optional(nullable(string)),
    facts: optional(nullable(record)),
    payload: optional(record),
    createdAt: optional(nullable(string)),
  })(value);
}

export function isFlowTaskCandidate(value: unknown): value is FlowTaskCandidate {
  return object<FlowTaskCandidate>({
    agentType: literals('user', 'permission', 'resolver'),
    agentId: string,
    ruleId: optional(string),
    label: optional(string),
    resolverKey: optional(string),
    unresolved: optional(boolean),
  })(value);
}

export function isFlowTaskUser(value: unknown): value is FlowTaskUser {
  return object<FlowTaskUser>({
    id: string,
    email: optional(string),
    externalSubject: optional(nullable(string)),
    locale: optional(nullable(string)),
  })(value);
}

export function isFlowPolicySet(value: unknown): value is FlowPolicySet {
  return object<FlowPolicySet>({
    id: string,
    scopeId: string,
    version: string,
    isActive: boolean,
    name: optional(nullable(string)),
    description: optional(nullable(string)),
    meta: optional(record),
  })(value);
}

export function isFlowPolicyRule(value: unknown): value is FlowPolicyRule {
  return object<FlowPolicyRule>({
    id: string,
    policySetId: string,
    nodeCode: optional(nullable(string)),
    statusCode: optional(nullable(string)),
    action: optional(nullable(string)),
    capability: optional(nullable(string)),
    effect: literals('allow', 'deny'),
    priority: optional(number),
    reasonCode: optional(nullable(string)),
    conditions: optional(record),
    meta: optional(record),
  })(value);
}

export function isFlowPolicyDecision(value: unknown): value is FlowPolicyDecision {
  return object<FlowPolicyDecision>({
    allowed: boolean,
    effect: literals('allow', 'deny'),
    reasonCode: optional(nullable(string)),
    matchedRuleId: optional(nullable(string)),
    defaulted: boolean,
  })(value);
}

export function isFlowEffectDispatchSummary(value: unknown): value is FlowEffectDispatchSummary {
  return object<FlowEffectDispatchSummary>({
    attempted: number,
    succeeded: number,
    failed: number,
    skipped: number,
    diagnostics: array(record),
  })(value);
}

export function isFlowGraphExport(value: unknown): value is FlowGraphExport {
  return object<FlowGraphExport>({
    graph: isFlowGraph,
    nodes: array(isFlowNode),
    edges: array(isFlowEdge),
    transitionEffects: array(isFlowTransitionEffect),
    agentRules: array(isFlowAgentRule),
    nodeFormRules: array(isFlowNodeFormRule),
    policySets: array(record),
    policyRules: array(record),
  })(value);
}

export const isFlowNodeKind: Guard<FlowNodeKind> = literals('human', 'auto', 'system', 'start', 'end', 'gateway');

export const isFlowDecisionPolicy: Guard<FlowDecisionPolicy> = literals('all', 'any', 'quorum');

export const isFlowGraphStatus: Guard<FlowGraphStatus> = literals('draft', 'published');

export const isFlowRunStatus: Guard<FlowRunStatus> = literals('active', 'completed', 'canceled');

export const isFlowTaskStatus: Guard<FlowTaskStatus> = literals('open', 'completed', 'canceled', 'expired');

export const isFlowFieldType: Guard<FlowFieldType> = literals('boolean', 'string', 'text', 'number', 'date', 'select', 'multiselect', 'file', 'signature', 'url', 'cnpj', 'email');

export const isFlowRunActivityEvent: Guard<FlowRunActivityEvent> = isFlowEvent;

export function isFlowPage<T>(item: Guard<T>): Guard<FlowPage<T>> {
  return object<FlowPage<T>>({ data: array(item), meta: object<FlowPage<T>['meta']>({ page: number, pageSize: number, total: number }) });
}
export const isDeleteResult = object<{ id: string; deleted: boolean }>({ id: string, deleted: boolean });
export const isEnsureResult = object<{ runId: string }>({ runId: string });
