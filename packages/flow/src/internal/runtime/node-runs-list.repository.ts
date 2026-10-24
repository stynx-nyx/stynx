import { defineQuery, sql, type Transaction } from '@stynx-nyx/data';
import { z } from 'zod';

const selectedText = z.unknown().pipe(z.string());
// Existing pagination accepts fractions and Infinity without normalization.
const paginationNumber = z.custom<number>((value) => typeof value === 'number');
const nodeRunRow = z.looseObject({
  id: z.unknown().optional(),
  node_code: z.unknown().optional(),
  node_name: z.unknown().optional(),
  kind: z.unknown().optional(),
});
const countRow = z.object({ total: z.string().nullish() });

function isNodeRunListRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const nodeRunsData0 = defineQuery({
  name: 'flow.node-runs-list.data.0',
  text: sql`
          select nr.*, n.code as node_code, n.name as node_name, n.kind
          from flow.node_runs nr
          join flow.nodes n on n.id = nr.node_id
          \n          order by nr.opened_at desc, nr.id desc
          limit $1 offset $2
        `,
  params: z.tuple([paginationNumber, paginationNumber]),
  row: nodeRunRow,
  expects: 'many',
});

const nodeRunsCount0 = defineQuery({
  name: 'flow.node-runs-list.count.0',
  text: sql`select count(*)::text as total from flow.node_runs nr`,
  params: z.tuple([]),
  row: countRow,
  expects: 'many',
});

const nodeRunsData1 = defineQuery({
  name: 'flow.node-runs-list.data.1',
  text: sql`
          select nr.*, n.code as node_code, n.name as node_name, n.kind
          from flow.node_runs nr
          join flow.nodes n on n.id = nr.node_id
           where nr.run_id = $1::uuid
          order by nr.opened_at desc, nr.id desc
          limit $2 offset $3
        `,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: nodeRunRow,
  expects: 'many',
});

const nodeRunsCount1 = defineQuery({
  name: 'flow.node-runs-list.count.1',
  text: sql`select count(*)::text as total from flow.node_runs nr where nr.run_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const nodeRunsData2 = defineQuery({
  name: 'flow.node-runs-list.data.2',
  text: sql`
          select nr.*, n.code as node_code, n.name as node_name, n.kind
          from flow.node_runs nr
          join flow.nodes n on n.id = nr.node_id
           where nr.status = $1
          order by nr.opened_at desc, nr.id desc
          limit $2 offset $3
        `,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: nodeRunRow,
  expects: 'many',
});

const nodeRunsCount2 = defineQuery({
  name: 'flow.node-runs-list.count.2',
  text: sql`select count(*)::text as total from flow.node_runs nr where nr.status = $1`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const nodeRunsData3 = defineQuery({
  name: 'flow.node-runs-list.data.3',
  text: sql`
          select nr.*, n.code as node_code, n.name as node_name, n.kind
          from flow.node_runs nr
          join flow.nodes n on n.id = nr.node_id
           where nr.run_id = $1::uuid and nr.status = $2
          order by nr.opened_at desc, nr.id desc
          limit $3 offset $4
        `,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: nodeRunRow,
  expects: 'many',
});

const nodeRunsCount3 = defineQuery({
  name: 'flow.node-runs-list.count.3',
  text: sql`select count(*)::text as total from flow.node_runs nr where nr.run_id = $1::uuid and nr.status = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

// Direct leaves preserve each pair's exact binds and data-before-count sequencing.
export async function executeNodeRunsList(
  trx: Transaction,
  runId: string | undefined,
  status: string | undefined,
  limit: number,
  offset: number,
) {
  const mask = (runId !== undefined ? 1 : 0) | (status !== undefined ? 2 : 0);
  switch (mask) {
    case 0: {
      const rows = await trx.runGuarded(nodeRunsData0, [limit, offset], isNodeRunListRow);
      const total = await trx.run(nodeRunsCount0, []);
      return { rows, total };
    }
    case 1: {
      const rows = await trx.runGuarded(nodeRunsData1, [runId, limit, offset], isNodeRunListRow);
      const total = await trx.run(nodeRunsCount1, [runId]);
      return { rows, total };
    }
    case 2: {
      const rows = await trx.runGuarded(nodeRunsData2, [status, limit, offset], isNodeRunListRow);
      const total = await trx.run(nodeRunsCount2, [status]);
      return { rows, total };
    }
    case 3: {
      const rows = await trx.runGuarded(nodeRunsData3, [runId, status, limit, offset], isNodeRunListRow);
      const total = await trx.run(nodeRunsCount3, [runId, status]);
      return { rows, total };
    }
    default:
      throw new RangeError('Invalid node-runs filter mask');
  }
}
