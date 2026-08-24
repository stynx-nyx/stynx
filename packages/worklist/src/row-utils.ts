import { WorklistInputError } from './errors';
import type {
  WorklistCandidate,
  WorklistEvent,
  WorklistItemRecord,
  WorklistJsonObject,
  WorklistQueueRecord,
  WorklistWorkerStateRecord,
} from './types';

export type WorklistRow = Record<string, unknown>;

export const QUEUE_COLUMNS = `
  id,
  tenant_id as "tenantId",
  code,
  name,
  description,
  strategy,
  strategy_config as "strategyConfig",
  required_permission as "requiredPermission",
  supervisor_permission as "supervisorPermission",
  claim_limit as "claimLimit",
  default_sla_seconds as "defaultSlaSeconds",
  default_sla_business_days as "defaultSlaBusinessDays",
  default_calendar_key as "defaultCalendarKey",
  meta,
  created_by as "createdBy",
  updated_by as "updatedBy",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export const WORKER_STATE_COLUMNS = `
  id,
  tenant_id as "tenantId",
  queue_id as "queueId",
  user_id as "userId",
  is_available as available,
  weight,
  last_assigned_at as "lastAssignedAt",
  meta,
  created_by as "createdBy",
  updated_by as "updatedBy",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export const ITEM_COLUMNS = `
  id,
  tenant_id as "tenantId",
  queue_id as "queueId",
  entity_type as "entityType",
  entity_id as "entityId",
  priority,
  status,
  assignee_id as "assigneeId",
  claimed_at as "claimedAt",
  deadline_kind as "deadlineKind",
  deadline_business_days as "deadlineBusinessDays",
  deadline_calendar_key as "deadlineCalendarKey",
  due_at as "dueAt",
  breach_detected_at as "breachDetectedAt",
  completed_at as "completedAt",
  completed_by as "completedBy",
  canceled_at as "canceledAt",
  payload,
  meta,
  created_by as "createdBy",
  updated_by as "updatedBy",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

export const EVENT_COLUMNS = `
  id,
  tenant_id as "tenantId",
  item_id as "itemId",
  kind,
  actor_id as "actorId",
  from_assignee as "fromAssignee",
  to_assignee as "toAssignee",
  reason,
  payload,
  created_at as "createdAt"
`;

export function mapQueueRow(row: WorklistRow): WorklistQueueRecord {
  const elapsedSeconds = nullableNumber(row.defaultSlaSeconds);
  const businessDays = nullableNumber(row.defaultSlaBusinessDays);
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    code: String(row.code),
    name: String(row.name),
    description: nullableString(row.description),
    strategy: String(row.strategy),
    strategyConfig: jsonObject(row.strategyConfig),
    requiredPermission: String(row.requiredPermission),
    supervisorPermission: String(row.supervisorPermission),
    claimLimit: nullableNumber(row.claimLimit),
    defaultDeadline:
      elapsedSeconds !== null
        ? { kind: 'elapsed', seconds: elapsedSeconds }
        : businessDays !== null
          ? {
              kind: 'business_days',
              businessDays,
              ...(row.defaultCalendarKey ? { calendarKey: String(row.defaultCalendarKey) } : {}),
            }
          : null,
    meta: jsonObject(row.meta),
    createdBy: nullableString(row.createdBy),
    updatedBy: nullableString(row.updatedBy),
    createdAt: requiredDate(row.createdAt, 'createdAt'),
    updatedAt: requiredDate(row.updatedAt, 'updatedAt'),
  };
}

export function mapWorkerStateRow(row: WorklistRow): WorklistWorkerStateRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    queueId: String(row.queueId),
    userId: String(row.userId),
    available: Boolean(row.available),
    weight: Number(row.weight),
    lastAssignedAt: nullableDate(row.lastAssignedAt),
    meta: jsonObject(row.meta),
    createdBy: nullableString(row.createdBy),
    updatedBy: nullableString(row.updatedBy),
    createdAt: requiredDate(row.createdAt, 'createdAt'),
    updatedAt: requiredDate(row.updatedAt, 'updatedAt'),
  };
}

export function mapItemRow(row: WorklistRow): WorklistItemRecord {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    queueId: String(row.queueId),
    entityType: String(row.entityType),
    entityId: String(row.entityId),
    priority: Number(row.priority),
    status: row.status as WorklistItemRecord['status'],
    assigneeId: nullableString(row.assigneeId),
    claimedAt: nullableDate(row.claimedAt),
    deadlineKind: row.deadlineKind as WorklistItemRecord['deadlineKind'],
    deadlineBusinessDays: nullableNumber(row.deadlineBusinessDays),
    deadlineCalendarKey: nullableString(row.deadlineCalendarKey),
    dueAt: nullableDate(row.dueAt),
    breachDetectedAt: nullableDate(row.breachDetectedAt),
    completedAt: nullableDate(row.completedAt),
    completedBy: nullableString(row.completedBy),
    canceledAt: nullableDate(row.canceledAt),
    payload: jsonObject(row.payload),
    meta: jsonObject(row.meta),
    createdBy: nullableString(row.createdBy),
    updatedBy: nullableString(row.updatedBy),
    createdAt: requiredDate(row.createdAt, 'createdAt'),
    updatedAt: requiredDate(row.updatedAt, 'updatedAt'),
  };
}

export function mapEventRow(row: WorklistRow): WorklistEvent {
  return {
    id: String(row.id ?? row.eventId),
    tenantId: String(row.tenantId),
    itemId: String(row.itemId),
    kind: row.kind as WorklistEvent['kind'],
    actorId: nullableString(row.actorId),
    fromAssignee: nullableString(row.fromAssignee),
    toAssignee: nullableString(row.toAssignee),
    reason: nullableString(row.reason),
    payload: jsonObject(row.payload),
    createdAt: requiredDate(row.createdAt, 'createdAt'),
  };
}

export function mapCandidateRow(row: WorklistRow): WorklistCandidate {
  return {
    userId: String(row.userId),
    available: Boolean(row.available),
    weight: Number(row.weight),
    lastAssignedAt: nullableDate(row.lastAssignedAt),
    openItemCount: Number(row.openItemCount),
  };
}

export function pageLimitOffset(query: { page: number; pageSize: number }): {
  limit: number;
  offset: number;
} {
  return { limit: query.pageSize, offset: (query.page - 1) * query.pageSize };
}

export function requireObject(input: unknown): WorklistJsonObject {
  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
    return input as WorklistJsonObject;
  }
  throw new WorklistInputError('Input must be an object');
}

function jsonObject(value: unknown): WorklistJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as WorklistJsonObject)
    : {};
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function nullableDate(value: unknown): Date | null {
  return value === null || value === undefined ? null : requiredDate(value, 'date');
}

function requiredDate(value: unknown, field: string): Date {
  const date = value instanceof Date ? value : new Date(String(value));
  if (!Number.isFinite(date.getTime())) {
    throw new WorklistInputError(`Invalid ${field} value returned by database`);
  }
  return date;
}
