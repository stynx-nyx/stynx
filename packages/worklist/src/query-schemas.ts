import { z } from 'zod';

const text = z.string();
export const worklistUuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
// Row mappers retain their existing finite-Date checks and domain error boundary.
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const numeric = z.union([z.number(), text, z.nan(), z.literal(Infinity), z.literal(-Infinity)]);
const identity = { id: worklistUuid, tenantId: worklistUuid };
const audit = {
  createdBy: worklistUuid.nullable(), updatedBy: worklistUuid.nullable(),
  createdAt: timestamp, updatedAt: timestamp,
};

// Queue object/default results are established shallowly by mapQueueRow.
export const worklistQueueRow = z.looseObject({
  ...identity, code: text, name: text, description: text.nullable(), strategy: text,
  strategyConfig: z.unknown(), requiredPermission: text, supervisorPermission: text,
  claimLimit: numeric.nullable(), defaultSlaSeconds: numeric.nullable(),
  defaultSlaBusinessDays: numeric.nullable(), defaultCalendarKey: text.nullable(),
  meta: z.unknown(), ...audit,
});
export const worklistWorkerRow = z.looseObject({
  ...identity, queueId: worklistUuid, userId: worklistUuid, available: z.boolean(),
  weight: numeric, lastAssignedAt: timestamp.nullable(), meta: z.json(), ...audit,
});
export const worklistItemRow = z.looseObject({
  ...identity, queueId: worklistUuid, entityType: text, entityId: text, priority: numeric,
  status: z.enum(['pending', 'claimed', 'completed', 'canceled']), assigneeId: worklistUuid.nullable(),
  claimedAt: timestamp.nullable(), deadlineKind: z.enum(['absolute', 'business_days']).nullable(),
  deadlineBusinessDays: numeric.nullable(), deadlineCalendarKey: text.nullable(),
  dueAt: timestamp.nullable(), breachDetectedAt: timestamp.nullable(),
  completedAt: timestamp.nullable(), completedBy: worklistUuid.nullable(),
  canceledAt: timestamp.nullable(), payload: z.json(), meta: z.json(), ...audit,
});
const eventFields = {
  tenantId: worklistUuid, itemId: worklistUuid,
  kind: z.enum(['enqueue', 'claim', 'assign', 'release', 'complete', 'cancel', 'reassign', 'override', 'deadline_set', 'deadline_breach']),
  actorId: worklistUuid.nullable(), fromAssignee: worklistUuid.nullable(),
  toAssignee: worklistUuid.nullable(), reason: text.nullable(), payload: z.json(), createdAt: timestamp,
};
export const worklistEventRow = z.looseObject({ id: worklistUuid, ...eventFields });
export const worklistBreachRow = z.looseObject({ eventId: worklistUuid, ...eventFields });
export const worklistCandidateRow = z.looseObject({
  userId: worklistUuid, available: z.boolean(), weight: numeric,
  lastAssignedAt: timestamp.nullable(), openItemCount: numeric,
});
