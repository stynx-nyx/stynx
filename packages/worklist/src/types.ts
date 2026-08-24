export type WorklistJsonObject = Record<string, unknown>;
export type WorklistItemStatus = 'pending' | 'claimed' | 'completed' | 'canceled';
export type WorklistEventKind =
  | 'enqueue'
  | 'claim'
  | 'assign'
  | 'release'
  | 'complete'
  | 'cancel'
  | 'reassign'
  | 'override'
  | 'deadline_set'
  | 'deadline_breach';

export type WorklistDeadline =
  | { kind: 'absolute'; dueAt: Date | string }
  | {
      kind: 'business_days';
      businessDays: number;
      calendarKey?: string | undefined;
      startAt?: Date | string | undefined;
    };

export type WorklistQueueDefaultDeadline =
  | { kind: 'elapsed'; seconds: number }
  | { kind: 'business_days'; businessDays: number; calendarKey?: string | undefined };

export interface WorklistQueueRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  strategy: string;
  strategyConfig: WorklistJsonObject;
  requiredPermission: string;
  supervisorPermission: string;
  claimLimit: number | null;
  defaultDeadline: WorklistQueueDefaultDeadline | null;
  meta: WorklistJsonObject;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorklistWorkerStateRecord {
  id: string;
  tenantId: string;
  queueId: string;
  userId: string;
  available: boolean;
  weight: number;
  lastAssignedAt: Date | null;
  meta: WorklistJsonObject;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorklistItemRecord {
  id: string;
  tenantId: string;
  queueId: string;
  entityType: string;
  entityId: string;
  priority: number;
  status: WorklistItemStatus;
  assigneeId: string | null;
  claimedAt: Date | null;
  deadlineKind: 'absolute' | 'business_days' | null;
  deadlineBusinessDays: number | null;
  deadlineCalendarKey: string | null;
  dueAt: Date | null;
  breachDetectedAt: Date | null;
  completedAt: Date | null;
  completedBy: string | null;
  canceledAt: Date | null;
  payload: WorklistJsonObject;
  meta: WorklistJsonObject;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorklistEvent {
  id: string;
  tenantId: string;
  itemId: string;
  kind: WorklistEventKind;
  actorId: string | null;
  fromAssignee: string | null;
  toAssignee: string | null;
  reason: string | null;
  payload: WorklistJsonObject;
  createdAt: Date;
}

export interface WorklistCandidate {
  userId: string;
  available: boolean;
  weight: number;
  lastAssignedAt: Date | null;
  openItemCount: number;
}

export interface WorklistDistributionContext {
  queueId: string;
  candidates: WorklistCandidate[];
  strategyConfig?: WorklistJsonObject;
}

export interface WorklistDistributionStrategy {
  readonly key: string;
  select(context: WorklistDistributionContext): Promise<string | null>;
}

export interface CreateWorklistQueueInput {
  code: string;
  name: string;
  description?: string;
  strategy?: string;
  strategyConfig?: WorklistJsonObject;
  requiredPermission: string;
  supervisorPermission: string;
  claimLimit?: number;
  defaultDeadline?: WorklistQueueDefaultDeadline;
  meta?: WorklistJsonObject;
}

export interface UpdateWorklistQueueInput {
  name?: string;
  description?: string | null;
  strategy?: string;
  strategyConfig?: WorklistJsonObject;
  requiredPermission?: string;
  supervisorPermission?: string;
  claimLimit?: number | null;
  defaultDeadline?: WorklistQueueDefaultDeadline | null;
  meta?: WorklistJsonObject;
}

export interface SetWorklistWorkerStateInput {
  userId: string;
  available: boolean;
  weight?: number;
  meta?: WorklistJsonObject;
}

export interface EnqueueWorkItemInput {
  queueCode: string;
  entityType: string;
  entityId: string;
  priority?: number;
  deadline?: WorklistDeadline;
  payload?: WorklistJsonObject;
  meta?: WorklistJsonObject;
}

export interface WorklistSupervisorOverrideInput {
  itemId: string;
  operation: 'release' | 'complete' | 'reassign';
  reason: string;
  toUserId?: string;
  payload?: WorklistJsonObject;
}

export interface WorklistPage<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface ResolvedWorklistDeadline {
  kind: 'absolute' | 'business_days';
  dueAt: Date;
  businessDays: number | null;
  calendarKey: string | null;
}

export interface WorklistModuleOptions {
  calendar?: import('./ports').WorklistBusinessCalendar;
  scheduler?: import('./ports').WorklistSchedulerPort;
  eventSink?: import('./ports').WorklistEventSink;
  clock?: import('./ports').WorklistClock;
  strategies?: WorklistDistributionStrategy[];
}
