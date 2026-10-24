import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import { worklistUuid as uuid, worklistQueueRow, worklistWorkerRow, worklistEventRow, worklistItemRow, worklistCandidateRow, worklistBreachRow } from './query-schemas.js';
const text = z.string();
const number = z.number();

export const createQueue = defineQuery({
 name: 'worklist.createQueue', text: sql`insert into worklist.queues (
             tenant_id, code, name, description, strategy, strategy_config,
             required_permission, supervisor_permission, claim_limit,
             default_sla_seconds, default_sla_business_days, default_calendar_key,
             meta, created_by, updated_by
           ) values (
             current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5::jsonb,
             $6, $7, $8, $9, $10, $11, $12::jsonb,
             current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid
           ) returning 
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
`,
 params: z.tuple([text, text, text.nullable(), text, text, text, text, number.nullable(), number.nullable(), number.nullable(), text.nullable(), text]), row: worklistQueueRow, expects: 'many',
});

export const readQueue = defineQuery({
 name: 'worklist.readQueue', text: sql`select 
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
 from worklist.queues where id = $1`,
 params: z.tuple([uuid]), row: worklistQueueRow, expects: 'many',
});

export const readQueueByCode = defineQuery({
 name: 'worklist.readQueueByCode', text: sql`select 
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
 from worklist.queues where code = $1`,
 params: z.tuple([text]), row: worklistQueueRow, expects: 'many',
});

export const listQueues = defineQuery({
 name: 'worklist.listQueues', text: sql`select 
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
 from worklist.queues order by code, id limit $1 offset $2`,
 params: z.tuple([number, number]), row: worklistQueueRow, expects: 'many',
});

export const countQueues = defineQuery({
 name: 'worklist.countQueues', text: sql`select count(*)::text as total from worklist.queues`,
 params: z.tuple([]), row: z.object({ total: text }), expects: 'many',
});

export const assertCanWork = defineQuery({
 name: 'worklist.assertCanWork', text: sql`select worklist.assert_can_work($1, $2, true)`,
 params: z.tuple([uuid, uuid]), row: z.object({ assert_can_work: text.nullable() }), expects: 'many',
});

export const setWorkerState = defineQuery({
 name: 'worklist.setWorkerState', text: sql`insert into worklist.worker_state (
             tenant_id, queue_id, user_id, is_available, weight, meta, created_by, updated_by
           ) values (
             current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5::jsonb,
             current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid
           )
           on conflict (tenant_id, queue_id, user_id) do update set
             is_available = excluded.is_available,
             weight = excluded.weight,
             meta = excluded.meta,
             updated_by = excluded.updated_by,
             updated_at = clock_timestamp()
           returning 
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
`,
 params: z.tuple([uuid, uuid, z.boolean(), number, text]), row: worklistWorkerRow, expects: 'many',
});

export const latestItemEvent = defineQuery({
 name: 'worklist.latestItemEvent', text: sql`select 
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
 from worklist.item_events
           where item_id = $1 order by created_at desc, id desc limit 1`,
 params: z.tuple([uuid]), row: worklistEventRow, expects: 'many',
});

export const newItemEvents = defineQuery({
 name: 'worklist.newItemEvents', text: sql`select 
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
 from worklist.item_events
           where item_id = $1 order by created_at, id offset $2`,
 params: z.tuple([uuid, number]), row: worklistEventRow, expects: 'many',
});

export const allItemEvents = defineQuery({
 name: 'worklist.allItemEvents', text: sql`select 
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
 from worklist.item_events where item_id = $1 order by created_at, id`,
 params: z.tuple([uuid]), row: worklistEventRow, expects: 'many',
});

export const readWorkItem = defineQuery({
 name: 'worklist.readWorkItem', text: sql`select 
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
 from worklist.items where id = $1`,
 params: z.tuple([uuid]), row: worklistItemRow, expects: 'many',
});

export const eligibleWorkers = defineQuery({
 name: 'worklist.eligibleWorkers', text: sql`select user_id as "userId", is_available as available, weight,
           last_assigned_at as "lastAssignedAt", open_item_count as "openItemCount"
         from worklist.eligible_workers($1)`,
 params: z.tuple([uuid]), row: worklistCandidateRow, expects: 'many',
});

export const detectBreaches = defineQuery({
 name: 'worklist.detectBreaches', text: sql`select event_id as "eventId", item_id as "itemId", tenant_id as "tenantId",
             kind, actor_id as "actorId", from_assignee as "fromAssignee",
             to_assignee as "toAssignee", reason, payload, created_at as "createdAt"
           from worklist.detect_breaches($1)`,
 params: z.tuple([number]), row: worklistBreachRow, expects: 'many',
});

