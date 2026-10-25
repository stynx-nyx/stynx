import { defineQuery, sql, type Transaction } from '@stynx-nyx/data';
import { z } from 'zod';

const selectedText = z.unknown().pipe(z.string());
const paginationNumber = z.custom<number>((value) => typeof value === 'number');
// Wildcard rows retain opaque column values and original presentation mapping.
const opaqueRow = z.object({});
const countRow = z.object({ total: z.string().nullish() });
function isListRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const data0 = defineQuery({
  name: 'flow.events-list.data.0',
  text: sql`select * from flow.events order by created_at desc, id desc limit $1 offset $2`,
  params: z.tuple([paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count0 = defineQuery({
  name: 'flow.events-list.count.0',
  text: sql`select count(*)::text as total from flow.events`,
  params: z.tuple([]),
  row: countRow,
  expects: 'many',
});

const data1 = defineQuery({
  name: 'flow.events-list.data.1',
  text: sql`select * from flow.events where run_id = $1::uuid order by created_at desc, id desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count1 = defineQuery({
  name: 'flow.events-list.count.1',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data2 = defineQuery({
  name: 'flow.events-list.data.2',
  text: sql`select * from flow.events where node_id = $1::uuid order by created_at desc, id desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count2 = defineQuery({
  name: 'flow.events-list.count.2',
  text: sql`select count(*)::text as total from flow.events where node_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data3 = defineQuery({
  name: 'flow.events-list.data.3',
  text: sql`select * from flow.events where run_id = $1::uuid and node_id = $2::uuid order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count3 = defineQuery({
  name: 'flow.events-list.count.3',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and node_id = $2::uuid`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data4 = defineQuery({
  name: 'flow.events-list.data.4',
  text: sql`select * from flow.events where task_id = $1::uuid order by created_at desc, id desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count4 = defineQuery({
  name: 'flow.events-list.count.4',
  text: sql`select count(*)::text as total from flow.events where task_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data5 = defineQuery({
  name: 'flow.events-list.data.5',
  text: sql`select * from flow.events where run_id = $1::uuid and task_id = $2::uuid order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count5 = defineQuery({
  name: 'flow.events-list.count.5',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and task_id = $2::uuid`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data6 = defineQuery({
  name: 'flow.events-list.data.6',
  text: sql`select * from flow.events where node_id = $1::uuid and task_id = $2::uuid order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count6 = defineQuery({
  name: 'flow.events-list.count.6',
  text: sql`select count(*)::text as total from flow.events where node_id = $1::uuid and task_id = $2::uuid`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data7 = defineQuery({
  name: 'flow.events-list.data.7',
  text: sql`select * from flow.events where run_id = $1::uuid and node_id = $2::uuid and task_id = $3::uuid order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count7 = defineQuery({
  name: 'flow.events-list.count.7',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and node_id = $2::uuid and task_id = $3::uuid`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data8 = defineQuery({
  name: 'flow.events-list.data.8',
  text: sql`select * from flow.events where kind = $1 order by created_at desc, id desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count8 = defineQuery({
  name: 'flow.events-list.count.8',
  text: sql`select count(*)::text as total from flow.events where kind = $1`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data9 = defineQuery({
  name: 'flow.events-list.data.9',
  text: sql`select * from flow.events where run_id = $1::uuid and kind = $2 order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count9 = defineQuery({
  name: 'flow.events-list.count.9',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and kind = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data10 = defineQuery({
  name: 'flow.events-list.data.10',
  text: sql`select * from flow.events where node_id = $1::uuid and kind = $2 order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count10 = defineQuery({
  name: 'flow.events-list.count.10',
  text: sql`select count(*)::text as total from flow.events where node_id = $1::uuid and kind = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data11 = defineQuery({
  name: 'flow.events-list.data.11',
  text: sql`select * from flow.events where run_id = $1::uuid and node_id = $2::uuid and kind = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count11 = defineQuery({
  name: 'flow.events-list.count.11',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and node_id = $2::uuid and kind = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data12 = defineQuery({
  name: 'flow.events-list.data.12',
  text: sql`select * from flow.events where task_id = $1::uuid and kind = $2 order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count12 = defineQuery({
  name: 'flow.events-list.count.12',
  text: sql`select count(*)::text as total from flow.events where task_id = $1::uuid and kind = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data13 = defineQuery({
  name: 'flow.events-list.data.13',
  text: sql`select * from flow.events where run_id = $1::uuid and task_id = $2::uuid and kind = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count13 = defineQuery({
  name: 'flow.events-list.count.13',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and task_id = $2::uuid and kind = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data14 = defineQuery({
  name: 'flow.events-list.data.14',
  text: sql`select * from flow.events where node_id = $1::uuid and task_id = $2::uuid and kind = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count14 = defineQuery({
  name: 'flow.events-list.count.14',
  text: sql`select count(*)::text as total from flow.events where node_id = $1::uuid and task_id = $2::uuid and kind = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data15 = defineQuery({
  name: 'flow.events-list.data.15',
  text: sql`select * from flow.events where run_id = $1::uuid and node_id = $2::uuid and task_id = $3::uuid and kind = $4 order by created_at desc, id desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count15 = defineQuery({
  name: 'flow.events-list.count.15',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and node_id = $2::uuid and task_id = $3::uuid and kind = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data16 = defineQuery({
  name: 'flow.events-list.data.16',
  text: sql`select * from flow.events where actor_id = $1 order by created_at desc, id desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count16 = defineQuery({
  name: 'flow.events-list.count.16',
  text: sql`select count(*)::text as total from flow.events where actor_id = $1`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data17 = defineQuery({
  name: 'flow.events-list.data.17',
  text: sql`select * from flow.events where run_id = $1::uuid and actor_id = $2 order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count17 = defineQuery({
  name: 'flow.events-list.count.17',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and actor_id = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data18 = defineQuery({
  name: 'flow.events-list.data.18',
  text: sql`select * from flow.events where node_id = $1::uuid and actor_id = $2 order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count18 = defineQuery({
  name: 'flow.events-list.count.18',
  text: sql`select count(*)::text as total from flow.events where node_id = $1::uuid and actor_id = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data19 = defineQuery({
  name: 'flow.events-list.data.19',
  text: sql`select * from flow.events where run_id = $1::uuid and node_id = $2::uuid and actor_id = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count19 = defineQuery({
  name: 'flow.events-list.count.19',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and node_id = $2::uuid and actor_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data20 = defineQuery({
  name: 'flow.events-list.data.20',
  text: sql`select * from flow.events where task_id = $1::uuid and actor_id = $2 order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count20 = defineQuery({
  name: 'flow.events-list.count.20',
  text: sql`select count(*)::text as total from flow.events where task_id = $1::uuid and actor_id = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data21 = defineQuery({
  name: 'flow.events-list.data.21',
  text: sql`select * from flow.events where run_id = $1::uuid and task_id = $2::uuid and actor_id = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count21 = defineQuery({
  name: 'flow.events-list.count.21',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and task_id = $2::uuid and actor_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data22 = defineQuery({
  name: 'flow.events-list.data.22',
  text: sql`select * from flow.events where node_id = $1::uuid and task_id = $2::uuid and actor_id = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count22 = defineQuery({
  name: 'flow.events-list.count.22',
  text: sql`select count(*)::text as total from flow.events where node_id = $1::uuid and task_id = $2::uuid and actor_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data23 = defineQuery({
  name: 'flow.events-list.data.23',
  text: sql`select * from flow.events where run_id = $1::uuid and node_id = $2::uuid and task_id = $3::uuid and actor_id = $4 order by created_at desc, id desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count23 = defineQuery({
  name: 'flow.events-list.count.23',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and node_id = $2::uuid and task_id = $3::uuid and actor_id = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data24 = defineQuery({
  name: 'flow.events-list.data.24',
  text: sql`select * from flow.events where kind = $1 and actor_id = $2 order by created_at desc, id desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count24 = defineQuery({
  name: 'flow.events-list.count.24',
  text: sql`select count(*)::text as total from flow.events where kind = $1 and actor_id = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data25 = defineQuery({
  name: 'flow.events-list.data.25',
  text: sql`select * from flow.events where run_id = $1::uuid and kind = $2 and actor_id = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count25 = defineQuery({
  name: 'flow.events-list.count.25',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and kind = $2 and actor_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data26 = defineQuery({
  name: 'flow.events-list.data.26',
  text: sql`select * from flow.events where node_id = $1::uuid and kind = $2 and actor_id = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count26 = defineQuery({
  name: 'flow.events-list.count.26',
  text: sql`select count(*)::text as total from flow.events where node_id = $1::uuid and kind = $2 and actor_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data27 = defineQuery({
  name: 'flow.events-list.data.27',
  text: sql`select * from flow.events where run_id = $1::uuid and node_id = $2::uuid and kind = $3 and actor_id = $4 order by created_at desc, id desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count27 = defineQuery({
  name: 'flow.events-list.count.27',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and node_id = $2::uuid and kind = $3 and actor_id = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data28 = defineQuery({
  name: 'flow.events-list.data.28',
  text: sql`select * from flow.events where task_id = $1::uuid and kind = $2 and actor_id = $3 order by created_at desc, id desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count28 = defineQuery({
  name: 'flow.events-list.count.28',
  text: sql`select count(*)::text as total from flow.events where task_id = $1::uuid and kind = $2 and actor_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data29 = defineQuery({
  name: 'flow.events-list.data.29',
  text: sql`select * from flow.events where run_id = $1::uuid and task_id = $2::uuid and kind = $3 and actor_id = $4 order by created_at desc, id desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count29 = defineQuery({
  name: 'flow.events-list.count.29',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and task_id = $2::uuid and kind = $3 and actor_id = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data30 = defineQuery({
  name: 'flow.events-list.data.30',
  text: sql`select * from flow.events where node_id = $1::uuid and task_id = $2::uuid and kind = $3 and actor_id = $4 order by created_at desc, id desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count30 = defineQuery({
  name: 'flow.events-list.count.30',
  text: sql`select count(*)::text as total from flow.events where node_id = $1::uuid and task_id = $2::uuid and kind = $3 and actor_id = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data31 = defineQuery({
  name: 'flow.events-list.data.31',
  text: sql`select * from flow.events where run_id = $1::uuid and node_id = $2::uuid and task_id = $3::uuid and kind = $4 and actor_id = $5 order by created_at desc, id desc limit $6 offset $7`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count31 = defineQuery({
  name: 'flow.events-list.count.31',
  text: sql`select count(*)::text as total from flow.events where run_id = $1::uuid and node_id = $2::uuid and task_id = $3::uuid and kind = $4 and actor_id = $5`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

export async function executeEventsList(
  trx: Transaction,
  runId: string | undefined,
  nodeId: string | undefined,
  taskId: string | undefined,
  kind: string | undefined,
  actorId: string | undefined,
  limit: number,
  offset: number,
) {
  const mask = (runId !== undefined ? 1 : 0) | (nodeId !== undefined ? 2 : 0) | (taskId !== undefined ? 4 : 0) | (kind !== undefined ? 8 : 0) | (actorId !== undefined ? 16 : 0);
  switch (mask) {
    case 0: {
      const rows = await trx.runGuarded(data0, [limit, offset], isListRow);
      const total = await trx.run(count0, []);
      return { rows, total };
    }
    case 1: {
      const rows = await trx.runGuarded(data1, [runId, limit, offset], isListRow);
      const total = await trx.run(count1, [runId]);
      return { rows, total };
    }
    case 2: {
      const rows = await trx.runGuarded(data2, [nodeId, limit, offset], isListRow);
      const total = await trx.run(count2, [nodeId]);
      return { rows, total };
    }
    case 3: {
      const rows = await trx.runGuarded(data3, [runId, nodeId, limit, offset], isListRow);
      const total = await trx.run(count3, [runId, nodeId]);
      return { rows, total };
    }
    case 4: {
      const rows = await trx.runGuarded(data4, [taskId, limit, offset], isListRow);
      const total = await trx.run(count4, [taskId]);
      return { rows, total };
    }
    case 5: {
      const rows = await trx.runGuarded(data5, [runId, taskId, limit, offset], isListRow);
      const total = await trx.run(count5, [runId, taskId]);
      return { rows, total };
    }
    case 6: {
      const rows = await trx.runGuarded(data6, [nodeId, taskId, limit, offset], isListRow);
      const total = await trx.run(count6, [nodeId, taskId]);
      return { rows, total };
    }
    case 7: {
      const rows = await trx.runGuarded(data7, [runId, nodeId, taskId, limit, offset], isListRow);
      const total = await trx.run(count7, [runId, nodeId, taskId]);
      return { rows, total };
    }
    case 8: {
      const rows = await trx.runGuarded(data8, [kind, limit, offset], isListRow);
      const total = await trx.run(count8, [kind]);
      return { rows, total };
    }
    case 9: {
      const rows = await trx.runGuarded(data9, [runId, kind, limit, offset], isListRow);
      const total = await trx.run(count9, [runId, kind]);
      return { rows, total };
    }
    case 10: {
      const rows = await trx.runGuarded(data10, [nodeId, kind, limit, offset], isListRow);
      const total = await trx.run(count10, [nodeId, kind]);
      return { rows, total };
    }
    case 11: {
      const rows = await trx.runGuarded(data11, [runId, nodeId, kind, limit, offset], isListRow);
      const total = await trx.run(count11, [runId, nodeId, kind]);
      return { rows, total };
    }
    case 12: {
      const rows = await trx.runGuarded(data12, [taskId, kind, limit, offset], isListRow);
      const total = await trx.run(count12, [taskId, kind]);
      return { rows, total };
    }
    case 13: {
      const rows = await trx.runGuarded(data13, [runId, taskId, kind, limit, offset], isListRow);
      const total = await trx.run(count13, [runId, taskId, kind]);
      return { rows, total };
    }
    case 14: {
      const rows = await trx.runGuarded(data14, [nodeId, taskId, kind, limit, offset], isListRow);
      const total = await trx.run(count14, [nodeId, taskId, kind]);
      return { rows, total };
    }
    case 15: {
      const rows = await trx.runGuarded(data15, [runId, nodeId, taskId, kind, limit, offset], isListRow);
      const total = await trx.run(count15, [runId, nodeId, taskId, kind]);
      return { rows, total };
    }
    case 16: {
      const rows = await trx.runGuarded(data16, [actorId, limit, offset], isListRow);
      const total = await trx.run(count16, [actorId]);
      return { rows, total };
    }
    case 17: {
      const rows = await trx.runGuarded(data17, [runId, actorId, limit, offset], isListRow);
      const total = await trx.run(count17, [runId, actorId]);
      return { rows, total };
    }
    case 18: {
      const rows = await trx.runGuarded(data18, [nodeId, actorId, limit, offset], isListRow);
      const total = await trx.run(count18, [nodeId, actorId]);
      return { rows, total };
    }
    case 19: {
      const rows = await trx.runGuarded(data19, [runId, nodeId, actorId, limit, offset], isListRow);
      const total = await trx.run(count19, [runId, nodeId, actorId]);
      return { rows, total };
    }
    case 20: {
      const rows = await trx.runGuarded(data20, [taskId, actorId, limit, offset], isListRow);
      const total = await trx.run(count20, [taskId, actorId]);
      return { rows, total };
    }
    case 21: {
      const rows = await trx.runGuarded(data21, [runId, taskId, actorId, limit, offset], isListRow);
      const total = await trx.run(count21, [runId, taskId, actorId]);
      return { rows, total };
    }
    case 22: {
      const rows = await trx.runGuarded(data22, [nodeId, taskId, actorId, limit, offset], isListRow);
      const total = await trx.run(count22, [nodeId, taskId, actorId]);
      return { rows, total };
    }
    case 23: {
      const rows = await trx.runGuarded(data23, [runId, nodeId, taskId, actorId, limit, offset], isListRow);
      const total = await trx.run(count23, [runId, nodeId, taskId, actorId]);
      return { rows, total };
    }
    case 24: {
      const rows = await trx.runGuarded(data24, [kind, actorId, limit, offset], isListRow);
      const total = await trx.run(count24, [kind, actorId]);
      return { rows, total };
    }
    case 25: {
      const rows = await trx.runGuarded(data25, [runId, kind, actorId, limit, offset], isListRow);
      const total = await trx.run(count25, [runId, kind, actorId]);
      return { rows, total };
    }
    case 26: {
      const rows = await trx.runGuarded(data26, [nodeId, kind, actorId, limit, offset], isListRow);
      const total = await trx.run(count26, [nodeId, kind, actorId]);
      return { rows, total };
    }
    case 27: {
      const rows = await trx.runGuarded(data27, [runId, nodeId, kind, actorId, limit, offset], isListRow);
      const total = await trx.run(count27, [runId, nodeId, kind, actorId]);
      return { rows, total };
    }
    case 28: {
      const rows = await trx.runGuarded(data28, [taskId, kind, actorId, limit, offset], isListRow);
      const total = await trx.run(count28, [taskId, kind, actorId]);
      return { rows, total };
    }
    case 29: {
      const rows = await trx.runGuarded(data29, [runId, taskId, kind, actorId, limit, offset], isListRow);
      const total = await trx.run(count29, [runId, taskId, kind, actorId]);
      return { rows, total };
    }
    case 30: {
      const rows = await trx.runGuarded(data30, [nodeId, taskId, kind, actorId, limit, offset], isListRow);
      const total = await trx.run(count30, [nodeId, taskId, kind, actorId]);
      return { rows, total };
    }
    case 31: {
      const rows = await trx.runGuarded(data31, [runId, nodeId, taskId, kind, actorId, limit, offset], isListRow);
      const total = await trx.run(count31, [runId, nodeId, taskId, kind, actorId]);
      return { rows, total };
    }
    default:
      throw new RangeError('Invalid events filter mask');
  }
}
