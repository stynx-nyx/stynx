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
  name: 'flow.runs-list.data.0',
  text: sql`select * from flow.runs order by created_at desc limit $1 offset $2`,
  params: z.tuple([paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count0 = defineQuery({
  name: 'flow.runs-list.count.0',
  text: sql`select count(*)::text as total from flow.runs`,
  params: z.tuple([]),
  row: countRow,
  expects: 'many',
});

const data1 = defineQuery({
  name: 'flow.runs-list.data.1',
  text: sql`select * from flow.runs where scope_id = $1::uuid order by created_at desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count1 = defineQuery({
  name: 'flow.runs-list.count.1',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data2 = defineQuery({
  name: 'flow.runs-list.data.2',
  text: sql`select * from flow.runs where graph_id = $1::uuid order by created_at desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count2 = defineQuery({
  name: 'flow.runs-list.count.2',
  text: sql`select count(*)::text as total from flow.runs where graph_id = $1::uuid`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data3 = defineQuery({
  name: 'flow.runs-list.data.3',
  text: sql`select * from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count3 = defineQuery({
  name: 'flow.runs-list.count.3',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data4 = defineQuery({
  name: 'flow.runs-list.data.4',
  text: sql`select * from flow.runs where target_type = $1 order by created_at desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count4 = defineQuery({
  name: 'flow.runs-list.count.4',
  text: sql`select count(*)::text as total from flow.runs where target_type = $1`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data5 = defineQuery({
  name: 'flow.runs-list.data.5',
  text: sql`select * from flow.runs where scope_id = $1::uuid and target_type = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count5 = defineQuery({
  name: 'flow.runs-list.count.5',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and target_type = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data6 = defineQuery({
  name: 'flow.runs-list.data.6',
  text: sql`select * from flow.runs where graph_id = $1::uuid and target_type = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count6 = defineQuery({
  name: 'flow.runs-list.count.6',
  text: sql`select count(*)::text as total from flow.runs where graph_id = $1::uuid and target_type = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data7 = defineQuery({
  name: 'flow.runs-list.data.7',
  text: sql`select * from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_type = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count7 = defineQuery({
  name: 'flow.runs-list.count.7',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_type = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data8 = defineQuery({
  name: 'flow.runs-list.data.8',
  text: sql`select * from flow.runs where target_id = $1 order by created_at desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count8 = defineQuery({
  name: 'flow.runs-list.count.8',
  text: sql`select count(*)::text as total from flow.runs where target_id = $1`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data9 = defineQuery({
  name: 'flow.runs-list.data.9',
  text: sql`select * from flow.runs where scope_id = $1::uuid and target_id = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count9 = defineQuery({
  name: 'flow.runs-list.count.9',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and target_id = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data10 = defineQuery({
  name: 'flow.runs-list.data.10',
  text: sql`select * from flow.runs where graph_id = $1::uuid and target_id = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count10 = defineQuery({
  name: 'flow.runs-list.count.10',
  text: sql`select count(*)::text as total from flow.runs where graph_id = $1::uuid and target_id = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data11 = defineQuery({
  name: 'flow.runs-list.data.11',
  text: sql`select * from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_id = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count11 = defineQuery({
  name: 'flow.runs-list.count.11',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data12 = defineQuery({
  name: 'flow.runs-list.data.12',
  text: sql`select * from flow.runs where target_type = $1 and target_id = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count12 = defineQuery({
  name: 'flow.runs-list.count.12',
  text: sql`select count(*)::text as total from flow.runs where target_type = $1 and target_id = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data13 = defineQuery({
  name: 'flow.runs-list.data.13',
  text: sql`select * from flow.runs where scope_id = $1::uuid and target_type = $2 and target_id = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count13 = defineQuery({
  name: 'flow.runs-list.count.13',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and target_type = $2 and target_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data14 = defineQuery({
  name: 'flow.runs-list.data.14',
  text: sql`select * from flow.runs where graph_id = $1::uuid and target_type = $2 and target_id = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count14 = defineQuery({
  name: 'flow.runs-list.count.14',
  text: sql`select count(*)::text as total from flow.runs where graph_id = $1::uuid and target_type = $2 and target_id = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data15 = defineQuery({
  name: 'flow.runs-list.data.15',
  text: sql`select * from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_type = $3 and target_id = $4 order by created_at desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count15 = defineQuery({
  name: 'flow.runs-list.count.15',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_type = $3 and target_id = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data16 = defineQuery({
  name: 'flow.runs-list.data.16',
  text: sql`select * from flow.runs where status = $1 order by created_at desc limit $2 offset $3`,
  params: z.tuple([selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count16 = defineQuery({
  name: 'flow.runs-list.count.16',
  text: sql`select count(*)::text as total from flow.runs where status = $1`,
  params: z.tuple([selectedText]),
  row: countRow,
  expects: 'many',
});

const data17 = defineQuery({
  name: 'flow.runs-list.data.17',
  text: sql`select * from flow.runs where scope_id = $1::uuid and status = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count17 = defineQuery({
  name: 'flow.runs-list.count.17',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and status = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data18 = defineQuery({
  name: 'flow.runs-list.data.18',
  text: sql`select * from flow.runs where graph_id = $1::uuid and status = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count18 = defineQuery({
  name: 'flow.runs-list.count.18',
  text: sql`select count(*)::text as total from flow.runs where graph_id = $1::uuid and status = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data19 = defineQuery({
  name: 'flow.runs-list.data.19',
  text: sql`select * from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and status = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count19 = defineQuery({
  name: 'flow.runs-list.count.19',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and status = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data20 = defineQuery({
  name: 'flow.runs-list.data.20',
  text: sql`select * from flow.runs where target_type = $1 and status = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count20 = defineQuery({
  name: 'flow.runs-list.count.20',
  text: sql`select count(*)::text as total from flow.runs where target_type = $1 and status = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data21 = defineQuery({
  name: 'flow.runs-list.data.21',
  text: sql`select * from flow.runs where scope_id = $1::uuid and target_type = $2 and status = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count21 = defineQuery({
  name: 'flow.runs-list.count.21',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and target_type = $2 and status = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data22 = defineQuery({
  name: 'flow.runs-list.data.22',
  text: sql`select * from flow.runs where graph_id = $1::uuid and target_type = $2 and status = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count22 = defineQuery({
  name: 'flow.runs-list.count.22',
  text: sql`select count(*)::text as total from flow.runs where graph_id = $1::uuid and target_type = $2 and status = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data23 = defineQuery({
  name: 'flow.runs-list.data.23',
  text: sql`select * from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_type = $3 and status = $4 order by created_at desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count23 = defineQuery({
  name: 'flow.runs-list.count.23',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_type = $3 and status = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data24 = defineQuery({
  name: 'flow.runs-list.data.24',
  text: sql`select * from flow.runs where target_id = $1 and status = $2 order by created_at desc limit $3 offset $4`,
  params: z.tuple([selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count24 = defineQuery({
  name: 'flow.runs-list.count.24',
  text: sql`select count(*)::text as total from flow.runs where target_id = $1 and status = $2`,
  params: z.tuple([selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data25 = defineQuery({
  name: 'flow.runs-list.data.25',
  text: sql`select * from flow.runs where scope_id = $1::uuid and target_id = $2 and status = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count25 = defineQuery({
  name: 'flow.runs-list.count.25',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and target_id = $2 and status = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data26 = defineQuery({
  name: 'flow.runs-list.data.26',
  text: sql`select * from flow.runs where graph_id = $1::uuid and target_id = $2 and status = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count26 = defineQuery({
  name: 'flow.runs-list.count.26',
  text: sql`select count(*)::text as total from flow.runs where graph_id = $1::uuid and target_id = $2 and status = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data27 = defineQuery({
  name: 'flow.runs-list.data.27',
  text: sql`select * from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_id = $3 and status = $4 order by created_at desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count27 = defineQuery({
  name: 'flow.runs-list.count.27',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_id = $3 and status = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data28 = defineQuery({
  name: 'flow.runs-list.data.28',
  text: sql`select * from flow.runs where target_type = $1 and target_id = $2 and status = $3 order by created_at desc limit $4 offset $5`,
  params: z.tuple([selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count28 = defineQuery({
  name: 'flow.runs-list.count.28',
  text: sql`select count(*)::text as total from flow.runs where target_type = $1 and target_id = $2 and status = $3`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data29 = defineQuery({
  name: 'flow.runs-list.data.29',
  text: sql`select * from flow.runs where scope_id = $1::uuid and target_type = $2 and target_id = $3 and status = $4 order by created_at desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count29 = defineQuery({
  name: 'flow.runs-list.count.29',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and target_type = $2 and target_id = $3 and status = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data30 = defineQuery({
  name: 'flow.runs-list.data.30',
  text: sql`select * from flow.runs where graph_id = $1::uuid and target_type = $2 and target_id = $3 and status = $4 order by created_at desc limit $5 offset $6`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count30 = defineQuery({
  name: 'flow.runs-list.count.30',
  text: sql`select count(*)::text as total from flow.runs where graph_id = $1::uuid and target_type = $2 and target_id = $3 and status = $4`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

const data31 = defineQuery({
  name: 'flow.runs-list.data.31',
  text: sql`select * from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_type = $3 and target_id = $4 and status = $5 order by created_at desc limit $6 offset $7`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText, paginationNumber, paginationNumber]),
  row: opaqueRow,
  expects: 'many',
});

const count31 = defineQuery({
  name: 'flow.runs-list.count.31',
  text: sql`select count(*)::text as total from flow.runs where scope_id = $1::uuid and graph_id = $2::uuid and target_type = $3 and target_id = $4 and status = $5`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: countRow,
  expects: 'many',
});

export async function executeRunsList(
  trx: Transaction,
  scopeId: string | undefined,
  graphId: string | undefined,
  targetType: string | undefined,
  targetId: string | undefined,
  status: string | undefined,
  limit: number,
  offset: number,
) {
  const mask = (scopeId !== undefined ? 1 : 0) | (graphId !== undefined ? 2 : 0) | (targetType !== undefined ? 4 : 0) | (targetId !== undefined ? 8 : 0) | (status !== undefined ? 16 : 0);
  switch (mask) {
    case 0: {
      const rows = await trx.runGuarded(data0, [limit, offset], isListRow);
      const total = await trx.run(count0, []);
      return { rows, total };
    }
    case 1: {
      const rows = await trx.runGuarded(data1, [scopeId, limit, offset], isListRow);
      const total = await trx.run(count1, [scopeId]);
      return { rows, total };
    }
    case 2: {
      const rows = await trx.runGuarded(data2, [graphId, limit, offset], isListRow);
      const total = await trx.run(count2, [graphId]);
      return { rows, total };
    }
    case 3: {
      const rows = await trx.runGuarded(data3, [scopeId, graphId, limit, offset], isListRow);
      const total = await trx.run(count3, [scopeId, graphId]);
      return { rows, total };
    }
    case 4: {
      const rows = await trx.runGuarded(data4, [targetType, limit, offset], isListRow);
      const total = await trx.run(count4, [targetType]);
      return { rows, total };
    }
    case 5: {
      const rows = await trx.runGuarded(data5, [scopeId, targetType, limit, offset], isListRow);
      const total = await trx.run(count5, [scopeId, targetType]);
      return { rows, total };
    }
    case 6: {
      const rows = await trx.runGuarded(data6, [graphId, targetType, limit, offset], isListRow);
      const total = await trx.run(count6, [graphId, targetType]);
      return { rows, total };
    }
    case 7: {
      const rows = await trx.runGuarded(data7, [scopeId, graphId, targetType, limit, offset], isListRow);
      const total = await trx.run(count7, [scopeId, graphId, targetType]);
      return { rows, total };
    }
    case 8: {
      const rows = await trx.runGuarded(data8, [targetId, limit, offset], isListRow);
      const total = await trx.run(count8, [targetId]);
      return { rows, total };
    }
    case 9: {
      const rows = await trx.runGuarded(data9, [scopeId, targetId, limit, offset], isListRow);
      const total = await trx.run(count9, [scopeId, targetId]);
      return { rows, total };
    }
    case 10: {
      const rows = await trx.runGuarded(data10, [graphId, targetId, limit, offset], isListRow);
      const total = await trx.run(count10, [graphId, targetId]);
      return { rows, total };
    }
    case 11: {
      const rows = await trx.runGuarded(data11, [scopeId, graphId, targetId, limit, offset], isListRow);
      const total = await trx.run(count11, [scopeId, graphId, targetId]);
      return { rows, total };
    }
    case 12: {
      const rows = await trx.runGuarded(data12, [targetType, targetId, limit, offset], isListRow);
      const total = await trx.run(count12, [targetType, targetId]);
      return { rows, total };
    }
    case 13: {
      const rows = await trx.runGuarded(data13, [scopeId, targetType, targetId, limit, offset], isListRow);
      const total = await trx.run(count13, [scopeId, targetType, targetId]);
      return { rows, total };
    }
    case 14: {
      const rows = await trx.runGuarded(data14, [graphId, targetType, targetId, limit, offset], isListRow);
      const total = await trx.run(count14, [graphId, targetType, targetId]);
      return { rows, total };
    }
    case 15: {
      const rows = await trx.runGuarded(data15, [scopeId, graphId, targetType, targetId, limit, offset], isListRow);
      const total = await trx.run(count15, [scopeId, graphId, targetType, targetId]);
      return { rows, total };
    }
    case 16: {
      const rows = await trx.runGuarded(data16, [status, limit, offset], isListRow);
      const total = await trx.run(count16, [status]);
      return { rows, total };
    }
    case 17: {
      const rows = await trx.runGuarded(data17, [scopeId, status, limit, offset], isListRow);
      const total = await trx.run(count17, [scopeId, status]);
      return { rows, total };
    }
    case 18: {
      const rows = await trx.runGuarded(data18, [graphId, status, limit, offset], isListRow);
      const total = await trx.run(count18, [graphId, status]);
      return { rows, total };
    }
    case 19: {
      const rows = await trx.runGuarded(data19, [scopeId, graphId, status, limit, offset], isListRow);
      const total = await trx.run(count19, [scopeId, graphId, status]);
      return { rows, total };
    }
    case 20: {
      const rows = await trx.runGuarded(data20, [targetType, status, limit, offset], isListRow);
      const total = await trx.run(count20, [targetType, status]);
      return { rows, total };
    }
    case 21: {
      const rows = await trx.runGuarded(data21, [scopeId, targetType, status, limit, offset], isListRow);
      const total = await trx.run(count21, [scopeId, targetType, status]);
      return { rows, total };
    }
    case 22: {
      const rows = await trx.runGuarded(data22, [graphId, targetType, status, limit, offset], isListRow);
      const total = await trx.run(count22, [graphId, targetType, status]);
      return { rows, total };
    }
    case 23: {
      const rows = await trx.runGuarded(data23, [scopeId, graphId, targetType, status, limit, offset], isListRow);
      const total = await trx.run(count23, [scopeId, graphId, targetType, status]);
      return { rows, total };
    }
    case 24: {
      const rows = await trx.runGuarded(data24, [targetId, status, limit, offset], isListRow);
      const total = await trx.run(count24, [targetId, status]);
      return { rows, total };
    }
    case 25: {
      const rows = await trx.runGuarded(data25, [scopeId, targetId, status, limit, offset], isListRow);
      const total = await trx.run(count25, [scopeId, targetId, status]);
      return { rows, total };
    }
    case 26: {
      const rows = await trx.runGuarded(data26, [graphId, targetId, status, limit, offset], isListRow);
      const total = await trx.run(count26, [graphId, targetId, status]);
      return { rows, total };
    }
    case 27: {
      const rows = await trx.runGuarded(data27, [scopeId, graphId, targetId, status, limit, offset], isListRow);
      const total = await trx.run(count27, [scopeId, graphId, targetId, status]);
      return { rows, total };
    }
    case 28: {
      const rows = await trx.runGuarded(data28, [targetType, targetId, status, limit, offset], isListRow);
      const total = await trx.run(count28, [targetType, targetId, status]);
      return { rows, total };
    }
    case 29: {
      const rows = await trx.runGuarded(data29, [scopeId, targetType, targetId, status, limit, offset], isListRow);
      const total = await trx.run(count29, [scopeId, targetType, targetId, status]);
      return { rows, total };
    }
    case 30: {
      const rows = await trx.runGuarded(data30, [graphId, targetType, targetId, status, limit, offset], isListRow);
      const total = await trx.run(count30, [graphId, targetType, targetId, status]);
      return { rows, total };
    }
    case 31: {
      const rows = await trx.runGuarded(data31, [scopeId, graphId, targetType, targetId, status, limit, offset], isListRow);
      const total = await trx.run(count31, [scopeId, graphId, targetType, targetId, status]);
      return { rows, total };
    }
    default:
      throw new RangeError('Invalid runs filter mask');
  }
}
