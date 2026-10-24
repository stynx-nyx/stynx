import { defineQuery, sql, type Transaction } from '@stynx-nyx/data';
import { z } from 'zod';

const selectedText = z.unknown().pipe(z.string());
// Existing pagination permits fractions and Infinity; validation does not normalize.
const paginationNumber = z.custom<number>((value) => typeof value === 'number');
// Wildcard rows remain opaque; the raw guard preserves all keys and nested identity.
const taskRow = z.looseObject({
  id: z.unknown().optional(),
  node_code: z.unknown().optional(),
  node_name: z.unknown().optional(),
  kind: z.unknown().optional(),
});
const countRow = z.object({ total: z.string().nullish() });

function isTaskListRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const taskListData00 = defineQuery({
  name: 'flow.task-list.data.0',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
          \n          order by t.created_at desc, t.id desc
          limit $1 offset $2
        `,
  params: z.tuple([paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount00 = defineQuery({
  name: 'flow.task-list.count.0',
  text: sql`select count(*)::text as total from flow.tasks t`,
  params: z.tuple([]),
  row: countRow,
  expects: 'many',
});

const taskListData01 = defineQuery({
  name: 'flow.task-list.data.1',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.run_id = $1::uuid
          order by t.created_at desc, t.id desc
          limit $2 offset $3
        `,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount01 = defineQuery({
  name: 'flow.task-list.count.1',
  text: sql`select count(*)::text as total from flow.tasks t where t.run_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData02 = defineQuery({
  name: 'flow.task-list.data.2',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.assignee_user_id = $1::uuid
          order by t.created_at desc, t.id desc
          limit $2 offset $3
        `,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount02 = defineQuery({
  name: 'flow.task-list.count.2',
  text: sql`select count(*)::text as total from flow.tasks t where t.assignee_user_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData03 = defineQuery({
  name: 'flow.task-list.data.3',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid
          order by t.created_at desc, t.id desc
          limit $3 offset $4
        `,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount03 = defineQuery({
  name: 'flow.task-list.count.3',
  text: sql`select count(*)::text as total from flow.tasks t where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData04 = defineQuery({
  name: 'flow.task-list.data.4',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.status = $1
          order by t.created_at desc, t.id desc
          limit $2 offset $3
        `,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount04 = defineQuery({
  name: 'flow.task-list.count.4',
  text: sql`select count(*)::text as total from flow.tasks t where t.status = $1`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData05 = defineQuery({
  name: 'flow.task-list.data.5',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.run_id = $1::uuid and t.status = $2
          order by t.created_at desc, t.id desc
          limit $3 offset $4
        `,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount05 = defineQuery({
  name: 'flow.task-list.count.5',
  text: sql`select count(*)::text as total from flow.tasks t where t.run_id = $1::uuid and t.status = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData06 = defineQuery({
  name: 'flow.task-list.data.6',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.assignee_user_id = $1::uuid and t.status = $2
          order by t.created_at desc, t.id desc
          limit $3 offset $4
        `,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount06 = defineQuery({
  name: 'flow.task-list.count.6',
  text: sql`select count(*)::text as total from flow.tasks t where t.assignee_user_id = $1::uuid and t.status = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData07 = defineQuery({
  name: 'flow.task-list.data.7',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid and t.status = $3
          order by t.created_at desc, t.id desc
          limit $4 offset $5
        `,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount07 = defineQuery({
  name: 'flow.task-list.count.7',
  text: sql`select count(*)::text as total from flow.tasks t where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid and t.status = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData08 = defineQuery({
  name: 'flow.task-list.data.8',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.assignee_user_id = $1::uuid
          order by t.created_at desc, t.id desc
          limit $2 offset $3
        `,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount08 = defineQuery({
  name: 'flow.task-list.count.8',
  text: sql`select count(*)::text as total from flow.tasks t where t.assignee_user_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData09 = defineQuery({
  name: 'flow.task-list.data.9',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid
          order by t.created_at desc, t.id desc
          limit $3 offset $4
        `,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount09 = defineQuery({
  name: 'flow.task-list.count.9',
  text: sql`select count(*)::text as total from flow.tasks t where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData10 = defineQuery({
  name: 'flow.task-list.data.10',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.assignee_user_id = $1::uuid and t.assignee_user_id = $2::uuid
          order by t.created_at desc, t.id desc
          limit $3 offset $4
        `,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount10 = defineQuery({
  name: 'flow.task-list.count.10',
  text: sql`select count(*)::text as total from flow.tasks t where t.assignee_user_id = $1::uuid and t.assignee_user_id = $2::uuid`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData11 = defineQuery({
  name: 'flow.task-list.data.11',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid and t.assignee_user_id = $3::uuid
          order by t.created_at desc, t.id desc
          limit $4 offset $5
        `,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount11 = defineQuery({
  name: 'flow.task-list.count.11',
  text: sql`select count(*)::text as total from flow.tasks t where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid and t.assignee_user_id = $3::uuid`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData12 = defineQuery({
  name: 'flow.task-list.data.12',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.status = $1 and t.assignee_user_id = $2::uuid
          order by t.created_at desc, t.id desc
          limit $3 offset $4
        `,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount12 = defineQuery({
  name: 'flow.task-list.count.12',
  text: sql`select count(*)::text as total from flow.tasks t where t.status = $1 and t.assignee_user_id = $2::uuid`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData13 = defineQuery({
  name: 'flow.task-list.data.13',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.run_id = $1::uuid and t.status = $2 and t.assignee_user_id = $3::uuid
          order by t.created_at desc, t.id desc
          limit $4 offset $5
        `,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount13 = defineQuery({
  name: 'flow.task-list.count.13',
  text: sql`select count(*)::text as total from flow.tasks t where t.run_id = $1::uuid and t.status = $2 and t.assignee_user_id = $3::uuid`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData14 = defineQuery({
  name: 'flow.task-list.data.14',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.assignee_user_id = $1::uuid and t.status = $2 and t.assignee_user_id = $3::uuid
          order by t.created_at desc, t.id desc
          limit $4 offset $5
        `,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount14 = defineQuery({
  name: 'flow.task-list.count.14',
  text: sql`select count(*)::text as total from flow.tasks t where t.assignee_user_id = $1::uuid and t.status = $2 and t.assignee_user_id = $3::uuid`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const taskListData15 = defineQuery({
  name: 'flow.task-list.data.15',
  text: sql`
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
           where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid and t.status = $3 and t.assignee_user_id = $4::uuid
          order by t.created_at desc, t.id desc
          limit $5 offset $6
        `,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: taskRow,
  expects: 'many',
});

const taskListCount15 = defineQuery({
  name: 'flow.task-list.count.15',
  text: sql`select count(*)::text as total from flow.tasks t where t.run_id = $1::uuid and t.assignee_user_id = $2::uuid and t.status = $3 and t.assignee_user_id = $4::uuid`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

// Each closed case proves its own leaves and keeps the data/count pair sequential.
export async function executeTaskList(
  trx: Transaction,
  runId: string | undefined,
  assigneeUserId: string | undefined,
  status: string | undefined,
  mineActorId: string | undefined,
  limit: number,
  offset: number,
) {
  const mask = (runId !== undefined ? 1 : 0)
    | (assigneeUserId !== undefined ? 2 : 0)
    | (status !== undefined ? 4 : 0)
    | (mineActorId !== undefined ? 8 : 0);
  switch (mask) {
    case 0: {
      const rows = await trx.runGuarded(taskListData00, [limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount00, []);
      return { rows, total };
    }
    case 1: {
      const rows = await trx.runGuarded(taskListData01, [runId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount01, [runId]);
      return { rows, total };
    }
    case 2: {
      const rows = await trx.runGuarded(taskListData02, [assigneeUserId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount02, [assigneeUserId]);
      return { rows, total };
    }
    case 3: {
      const rows = await trx.runGuarded(taskListData03, [runId, assigneeUserId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount03, [runId, assigneeUserId]);
      return { rows, total };
    }
    case 4: {
      const rows = await trx.runGuarded(taskListData04, [status, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount04, [status]);
      return { rows, total };
    }
    case 5: {
      const rows = await trx.runGuarded(taskListData05, [runId, status, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount05, [runId, status]);
      return { rows, total };
    }
    case 6: {
      const rows = await trx.runGuarded(taskListData06, [assigneeUserId, status, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount06, [assigneeUserId, status]);
      return { rows, total };
    }
    case 7: {
      const rows = await trx.runGuarded(taskListData07, [runId, assigneeUserId, status, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount07, [runId, assigneeUserId, status]);
      return { rows, total };
    }
    case 8: {
      const rows = await trx.runGuarded(taskListData08, [mineActorId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount08, [mineActorId]);
      return { rows, total };
    }
    case 9: {
      const rows = await trx.runGuarded(taskListData09, [runId, mineActorId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount09, [runId, mineActorId]);
      return { rows, total };
    }
    case 10: {
      const rows = await trx.runGuarded(taskListData10, [assigneeUserId, mineActorId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount10, [assigneeUserId, mineActorId]);
      return { rows, total };
    }
    case 11: {
      const rows = await trx.runGuarded(taskListData11, [runId, assigneeUserId, mineActorId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount11, [runId, assigneeUserId, mineActorId]);
      return { rows, total };
    }
    case 12: {
      const rows = await trx.runGuarded(taskListData12, [status, mineActorId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount12, [status, mineActorId]);
      return { rows, total };
    }
    case 13: {
      const rows = await trx.runGuarded(taskListData13, [runId, status, mineActorId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount13, [runId, status, mineActorId]);
      return { rows, total };
    }
    case 14: {
      const rows = await trx.runGuarded(taskListData14, [assigneeUserId, status, mineActorId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount14, [assigneeUserId, status, mineActorId]);
      return { rows, total };
    }
    case 15: {
      const rows = await trx.runGuarded(taskListData15, [runId, assigneeUserId, status, mineActorId, limit, offset], isTaskListRow);
      const total = await trx.run(taskListCount15, [runId, assigneeUserId, status, mineActorId]);
      return { rows, total };
    }
    default:
      throw new RangeError('Invalid task-list filter mask');
  }
}
