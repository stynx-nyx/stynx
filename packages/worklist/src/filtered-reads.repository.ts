import { defineQuery, sql, type TypedQuery } from '@stynx-nyx/data';
import { z } from 'zod';
import { worklistUuid as uuid, worklistItemRow, worklistEventRow } from './query-schemas.js';
const text = z.string();
const number = z.number();
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const countRow = z.object({ total: text });

const itemListQuery0 = defineQuery({name:'worklist.item.list.mask.0', text:sql`select 
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
 from worklist.items 
         order by priority, due_at asc nulls last, created_at, id
         limit $1 offset $2`, params:z.tuple([number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery1 = defineQuery({name:'worklist.item.list.mask.1', text:sql`select 
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
 from worklist.items where queue_id = $1
         order by priority, due_at asc nulls last, created_at, id
         limit $2 offset $3`, params:z.tuple([uuid, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery2 = defineQuery({name:'worklist.item.list.mask.2', text:sql`select 
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
 from worklist.items where status = $1::worklist.item_status
         order by priority, due_at asc nulls last, created_at, id
         limit $2 offset $3`, params:z.tuple([z.enum(['pending', 'claimed', 'completed', 'canceled']), number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery3 = defineQuery({name:'worklist.item.list.mask.3', text:sql`select 
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
 from worklist.items where queue_id = $1 and status = $2::worklist.item_status
         order by priority, due_at asc nulls last, created_at, id
         limit $3 offset $4`, params:z.tuple([uuid, z.enum(['pending', 'claimed', 'completed', 'canceled']), number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery4 = defineQuery({name:'worklist.item.list.mask.4', text:sql`select 
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
 from worklist.items where assignee_id = $1
         order by priority, due_at asc nulls last, created_at, id
         limit $2 offset $3`, params:z.tuple([uuid, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery5 = defineQuery({name:'worklist.item.list.mask.5', text:sql`select 
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
 from worklist.items where queue_id = $1 and assignee_id = $2
         order by priority, due_at asc nulls last, created_at, id
         limit $3 offset $4`, params:z.tuple([uuid, uuid, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery6 = defineQuery({name:'worklist.item.list.mask.6', text:sql`select 
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
 from worklist.items where status = $1::worklist.item_status and assignee_id = $2
         order by priority, due_at asc nulls last, created_at, id
         limit $3 offset $4`, params:z.tuple([z.enum(['pending', 'claimed', 'completed', 'canceled']), uuid, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery7 = defineQuery({name:'worklist.item.list.mask.7', text:sql`select 
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
 from worklist.items where queue_id = $1 and status = $2::worklist.item_status and assignee_id = $3
         order by priority, due_at asc nulls last, created_at, id
         limit $4 offset $5`, params:z.tuple([uuid, z.enum(['pending', 'claimed', 'completed', 'canceled']), uuid, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery8 = defineQuery({name:'worklist.item.list.mask.8', text:sql`select 
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
 from worklist.items where entity_type = $1
         order by priority, due_at asc nulls last, created_at, id
         limit $2 offset $3`, params:z.tuple([text, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery9 = defineQuery({name:'worklist.item.list.mask.9', text:sql`select 
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
 from worklist.items where queue_id = $1 and entity_type = $2
         order by priority, due_at asc nulls last, created_at, id
         limit $3 offset $4`, params:z.tuple([uuid, text, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery10 = defineQuery({name:'worklist.item.list.mask.10', text:sql`select 
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
 from worklist.items where status = $1::worklist.item_status and entity_type = $2
         order by priority, due_at asc nulls last, created_at, id
         limit $3 offset $4`, params:z.tuple([z.enum(['pending', 'claimed', 'completed', 'canceled']), text, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery11 = defineQuery({name:'worklist.item.list.mask.11', text:sql`select 
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
 from worklist.items where queue_id = $1 and status = $2::worklist.item_status and entity_type = $3
         order by priority, due_at asc nulls last, created_at, id
         limit $4 offset $5`, params:z.tuple([uuid, z.enum(['pending', 'claimed', 'completed', 'canceled']), text, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery12 = defineQuery({name:'worklist.item.list.mask.12', text:sql`select 
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
 from worklist.items where assignee_id = $1 and entity_type = $2
         order by priority, due_at asc nulls last, created_at, id
         limit $3 offset $4`, params:z.tuple([uuid, text, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery13 = defineQuery({name:'worklist.item.list.mask.13', text:sql`select 
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
 from worklist.items where queue_id = $1 and assignee_id = $2 and entity_type = $3
         order by priority, due_at asc nulls last, created_at, id
         limit $4 offset $5`, params:z.tuple([uuid, uuid, text, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery14 = defineQuery({name:'worklist.item.list.mask.14', text:sql`select 
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
 from worklist.items where status = $1::worklist.item_status and assignee_id = $2 and entity_type = $3
         order by priority, due_at asc nulls last, created_at, id
         limit $4 offset $5`, params:z.tuple([z.enum(['pending', 'claimed', 'completed', 'canceled']), uuid, text, number, number]), row:worklistItemRow, expects:'many'});
const itemListQuery15 = defineQuery({name:'worklist.item.list.mask.15', text:sql`select 
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
 from worklist.items where queue_id = $1 and status = $2::worklist.item_status and assignee_id = $3 and entity_type = $4
         order by priority, due_at asc nulls last, created_at, id
         limit $5 offset $6`, params:z.tuple([uuid, z.enum(['pending', 'claimed', 'completed', 'canceled']), uuid, text, number, number]), row:worklistItemRow, expects:'many'});

const itemCountQuery0 = defineQuery({name:'worklist.item.count.mask.0', text:sql`select count(*)::text as total from worklist.items `, params:z.tuple([]), row:countRow, expects:'many'});
const itemCountQuery1 = defineQuery({name:'worklist.item.count.mask.1', text:sql`select count(*)::text as total from worklist.items where queue_id = $1`, params:z.tuple([uuid]), row:countRow, expects:'many'});
const itemCountQuery2 = defineQuery({name:'worklist.item.count.mask.2', text:sql`select count(*)::text as total from worklist.items where status = $1::worklist.item_status`, params:z.tuple([z.enum(['pending', 'claimed', 'completed', 'canceled'])]), row:countRow, expects:'many'});
const itemCountQuery3 = defineQuery({name:'worklist.item.count.mask.3', text:sql`select count(*)::text as total from worklist.items where queue_id = $1 and status = $2::worklist.item_status`, params:z.tuple([uuid, z.enum(['pending', 'claimed', 'completed', 'canceled'])]), row:countRow, expects:'many'});
const itemCountQuery4 = defineQuery({name:'worklist.item.count.mask.4', text:sql`select count(*)::text as total from worklist.items where assignee_id = $1`, params:z.tuple([uuid]), row:countRow, expects:'many'});
const itemCountQuery5 = defineQuery({name:'worklist.item.count.mask.5', text:sql`select count(*)::text as total from worklist.items where queue_id = $1 and assignee_id = $2`, params:z.tuple([uuid, uuid]), row:countRow, expects:'many'});
const itemCountQuery6 = defineQuery({name:'worklist.item.count.mask.6', text:sql`select count(*)::text as total from worklist.items where status = $1::worklist.item_status and assignee_id = $2`, params:z.tuple([z.enum(['pending', 'claimed', 'completed', 'canceled']), uuid]), row:countRow, expects:'many'});
const itemCountQuery7 = defineQuery({name:'worklist.item.count.mask.7', text:sql`select count(*)::text as total from worklist.items where queue_id = $1 and status = $2::worklist.item_status and assignee_id = $3`, params:z.tuple([uuid, z.enum(['pending', 'claimed', 'completed', 'canceled']), uuid]), row:countRow, expects:'many'});
const itemCountQuery8 = defineQuery({name:'worklist.item.count.mask.8', text:sql`select count(*)::text as total from worklist.items where entity_type = $1`, params:z.tuple([text]), row:countRow, expects:'many'});
const itemCountQuery9 = defineQuery({name:'worklist.item.count.mask.9', text:sql`select count(*)::text as total from worklist.items where queue_id = $1 and entity_type = $2`, params:z.tuple([uuid, text]), row:countRow, expects:'many'});
const itemCountQuery10 = defineQuery({name:'worklist.item.count.mask.10', text:sql`select count(*)::text as total from worklist.items where status = $1::worklist.item_status and entity_type = $2`, params:z.tuple([z.enum(['pending', 'claimed', 'completed', 'canceled']), text]), row:countRow, expects:'many'});
const itemCountQuery11 = defineQuery({name:'worklist.item.count.mask.11', text:sql`select count(*)::text as total from worklist.items where queue_id = $1 and status = $2::worklist.item_status and entity_type = $3`, params:z.tuple([uuid, z.enum(['pending', 'claimed', 'completed', 'canceled']), text]), row:countRow, expects:'many'});
const itemCountQuery12 = defineQuery({name:'worklist.item.count.mask.12', text:sql`select count(*)::text as total from worklist.items where assignee_id = $1 and entity_type = $2`, params:z.tuple([uuid, text]), row:countRow, expects:'many'});
const itemCountQuery13 = defineQuery({name:'worklist.item.count.mask.13', text:sql`select count(*)::text as total from worklist.items where queue_id = $1 and assignee_id = $2 and entity_type = $3`, params:z.tuple([uuid, uuid, text]), row:countRow, expects:'many'});
const itemCountQuery14 = defineQuery({name:'worklist.item.count.mask.14', text:sql`select count(*)::text as total from worklist.items where status = $1::worklist.item_status and assignee_id = $2 and entity_type = $3`, params:z.tuple([z.enum(['pending', 'claimed', 'completed', 'canceled']), uuid, text]), row:countRow, expects:'many'});
const itemCountQuery15 = defineQuery({name:'worklist.item.count.mask.15', text:sql`select count(*)::text as total from worklist.items where queue_id = $1 and status = $2::worklist.item_status and assignee_id = $3 and entity_type = $4`, params:z.tuple([uuid, z.enum(['pending', 'claimed', 'completed', 'canceled']), uuid, text]), row:countRow, expects:'many'});

const eventListQuery0 = defineQuery({name:'worklist.event.list.mask.0', text:sql`select 
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
         order by created_at, id limit $1 offset $2`, params:z.tuple([number, number]), row:worklistEventRow, expects:'many'});
const eventListQuery1 = defineQuery({name:'worklist.event.list.mask.1', text:sql`select 
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
 from worklist.item_events where item_id = $1
         order by created_at, id limit $2 offset $3`, params:z.tuple([uuid, number, number]), row:worklistEventRow, expects:'many'});
const eventListQuery2 = defineQuery({name:'worklist.event.list.mask.2', text:sql`select 
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
 from worklist.item_events where created_at > $1
         order by created_at, id limit $2 offset $3`, params:z.tuple([timestamp, number, number]), row:worklistEventRow, expects:'many'});
const eventListQuery3 = defineQuery({name:'worklist.event.list.mask.3', text:sql`select 
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
 from worklist.item_events where item_id = $1 and created_at > $2
         order by created_at, id limit $3 offset $4`, params:z.tuple([uuid, timestamp, number, number]), row:worklistEventRow, expects:'many'});
const eventListQuery4 = defineQuery({name:'worklist.event.list.mask.4', text:sql`select 
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
 from worklist.item_events where id > $1
         order by created_at, id limit $2 offset $3`, params:z.tuple([uuid, number, number]), row:worklistEventRow, expects:'many'});
const eventListQuery5 = defineQuery({name:'worklist.event.list.mask.5', text:sql`select 
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
 from worklist.item_events where item_id = $1 and id > $2
         order by created_at, id limit $3 offset $4`, params:z.tuple([uuid, uuid, number, number]), row:worklistEventRow, expects:'many'});
const eventListQuery6 = defineQuery({name:'worklist.event.list.mask.6', text:sql`select 
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
 from worklist.item_events where created_at > $1 and id > $2
         order by created_at, id limit $3 offset $4`, params:z.tuple([timestamp, uuid, number, number]), row:worklistEventRow, expects:'many'});
const eventListQuery7 = defineQuery({name:'worklist.event.list.mask.7', text:sql`select 
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
 from worklist.item_events where item_id = $1 and created_at > $2 and id > $3
         order by created_at, id limit $4 offset $5`, params:z.tuple([uuid, timestamp, uuid, number, number]), row:worklistEventRow, expects:'many'});

const eventCountQuery0 = defineQuery({name:'worklist.event.count.mask.0', text:sql`select count(*)::text as total from worklist.item_events `, params:z.tuple([]), row:countRow, expects:'many'});
const eventCountQuery1 = defineQuery({name:'worklist.event.count.mask.1', text:sql`select count(*)::text as total from worklist.item_events where item_id = $1`, params:z.tuple([uuid]), row:countRow, expects:'many'});
const eventCountQuery2 = defineQuery({name:'worklist.event.count.mask.2', text:sql`select count(*)::text as total from worklist.item_events where created_at > $1`, params:z.tuple([timestamp]), row:countRow, expects:'many'});
const eventCountQuery3 = defineQuery({name:'worklist.event.count.mask.3', text:sql`select count(*)::text as total from worklist.item_events where item_id = $1 and created_at > $2`, params:z.tuple([uuid, timestamp]), row:countRow, expects:'many'});
const eventCountQuery4 = defineQuery({name:'worklist.event.count.mask.4', text:sql`select count(*)::text as total from worklist.item_events where id > $1`, params:z.tuple([uuid]), row:countRow, expects:'many'});
const eventCountQuery5 = defineQuery({name:'worklist.event.count.mask.5', text:sql`select count(*)::text as total from worklist.item_events where item_id = $1 and id > $2`, params:z.tuple([uuid, uuid]), row:countRow, expects:'many'});
const eventCountQuery6 = defineQuery({name:'worklist.event.count.mask.6', text:sql`select count(*)::text as total from worklist.item_events where created_at > $1 and id > $2`, params:z.tuple([timestamp, uuid]), row:countRow, expects:'many'});
const eventCountQuery7 = defineQuery({name:'worklist.event.count.mask.7', text:sql`select count(*)::text as total from worklist.item_events where item_id = $1 and created_at > $2 and id > $3`, params:z.tuple([uuid, timestamp, uuid]), row:countRow, expects:'many'});

export const selectItemListQuery = (mask: number): TypedQuery<z.ZodTuple, typeof worklistItemRow, 'many'> => {
  switch (mask) {
    case 0: return itemListQuery0;
    case 1: return itemListQuery1;
    case 2: return itemListQuery2;
    case 3: return itemListQuery3;
    case 4: return itemListQuery4;
    case 5: return itemListQuery5;
    case 6: return itemListQuery6;
    case 7: return itemListQuery7;
    case 8: return itemListQuery8;
    case 9: return itemListQuery9;
    case 10: return itemListQuery10;
    case 11: return itemListQuery11;
    case 12: return itemListQuery12;
    case 13: return itemListQuery13;
    case 14: return itemListQuery14;
    case 15: return itemListQuery15;
    default: throw new TypeError('Unknown worklist item filter mask');
  }
};

export const selectItemCountQuery = (mask: number): TypedQuery<z.ZodTuple, typeof countRow, 'many'> => {
  switch (mask) {
    case 0: return itemCountQuery0;
    case 1: return itemCountQuery1;
    case 2: return itemCountQuery2;
    case 3: return itemCountQuery3;
    case 4: return itemCountQuery4;
    case 5: return itemCountQuery5;
    case 6: return itemCountQuery6;
    case 7: return itemCountQuery7;
    case 8: return itemCountQuery8;
    case 9: return itemCountQuery9;
    case 10: return itemCountQuery10;
    case 11: return itemCountQuery11;
    case 12: return itemCountQuery12;
    case 13: return itemCountQuery13;
    case 14: return itemCountQuery14;
    case 15: return itemCountQuery15;
    default: throw new TypeError('Unknown worklist item filter mask');
  }
};

export const selectEventListQuery = (mask: number): TypedQuery<z.ZodTuple, typeof worklistEventRow, 'many'> => {
  switch (mask) {
    case 0: return eventListQuery0;
    case 1: return eventListQuery1;
    case 2: return eventListQuery2;
    case 3: return eventListQuery3;
    case 4: return eventListQuery4;
    case 5: return eventListQuery5;
    case 6: return eventListQuery6;
    case 7: return eventListQuery7;
    default: throw new TypeError('Unknown worklist event filter mask');
  }
};

export const selectEventCountQuery = (mask: number): TypedQuery<z.ZodTuple, typeof countRow, 'many'> => {
  switch (mask) {
    case 0: return eventCountQuery0;
    case 1: return eventCountQuery1;
    case 2: return eventCountQuery2;
    case 3: return eventCountQuery3;
    case 4: return eventCountQuery4;
    case 5: return eventCountQuery5;
    case 6: return eventCountQuery6;
    case 7: return eventCountQuery7;
    default: throw new TypeError('Unknown worklist event filter mask');
  }
};
