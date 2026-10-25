import { defineQuery, sql, type Transaction } from '@stynx-nyx/data';
import { z } from 'zod';

const selectedText = z.unknown().pipe(z.string());
const opaqueRow = z.object({});
function isFormsListRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type FormsListKey = 'forms' | 'questions' | 'fills' | 'answers' | 'waivers';

const forms0 = defineQuery({
  name: 'flow.forms.list.forms.0',
  text: sql`select * from flow.forms order by code, version`,
  params: z.tuple([]),
  row: opaqueRow,
  expects: 'many',
});

const forms1 = defineQuery({
  name: 'flow.forms.list.forms.1',
  text: sql`select * from flow.forms where scope_id = $1::uuid order by code, version`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

function executeFormDefinitionsList(trx: Transaction, filters: Record<string, string>) {
  const mask = (Object.prototype.hasOwnProperty.call(filters, 'scope_id') ? 1 : 0);
  switch (mask) {
    case 0:
      return trx.runGuarded(forms0, [], isFormsListRow);
    case 1:
      return trx.runGuarded(forms1, [filters.scope_id], isFormsListRow);
    default:
      throw new RangeError('Invalid forms list filter mask');
  }
}

const questions1 = defineQuery({
  name: 'flow.forms.list.questions.1',
  text: sql`select * from flow.questions where form_id = $1::uuid order by sort_order, key`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

function executeQuestionsList(trx: Transaction, filters: Record<string, string>) {
  return trx.runGuarded(questions1, [filters.form_id], isFormsListRow);
}

const fills0 = defineQuery({
  name: 'flow.forms.list.fills.0',
  text: sql`select * from flow.fills order by created_at desc`,
  params: z.tuple([]),
  row: opaqueRow,
  expects: 'many',
});

const fills1 = defineQuery({
  name: 'flow.forms.list.fills.1',
  text: sql`select * from flow.fills where form_id = $1::uuid order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills2 = defineQuery({
  name: 'flow.forms.list.fills.2',
  text: sql`select * from flow.fills where scope_id = $1::uuid order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills3 = defineQuery({
  name: 'flow.forms.list.fills.3',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills4 = defineQuery({
  name: 'flow.forms.list.fills.4',
  text: sql`select * from flow.fills where run_id = $1::uuid order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills5 = defineQuery({
  name: 'flow.forms.list.fills.5',
  text: sql`select * from flow.fills where form_id = $1::uuid and run_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills6 = defineQuery({
  name: 'flow.forms.list.fills.6',
  text: sql`select * from flow.fills where scope_id = $1::uuid and run_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills7 = defineQuery({
  name: 'flow.forms.list.fills.7',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and run_id = $3::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills8 = defineQuery({
  name: 'flow.forms.list.fills.8',
  text: sql`select * from flow.fills where task_id = $1::uuid order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills9 = defineQuery({
  name: 'flow.forms.list.fills.9',
  text: sql`select * from flow.fills where form_id = $1::uuid and task_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills10 = defineQuery({
  name: 'flow.forms.list.fills.10',
  text: sql`select * from flow.fills where scope_id = $1::uuid and task_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills11 = defineQuery({
  name: 'flow.forms.list.fills.11',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and task_id = $3::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills12 = defineQuery({
  name: 'flow.forms.list.fills.12',
  text: sql`select * from flow.fills where run_id = $1::uuid and task_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills13 = defineQuery({
  name: 'flow.forms.list.fills.13',
  text: sql`select * from flow.fills where form_id = $1::uuid and run_id = $2::uuid and task_id = $3::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills14 = defineQuery({
  name: 'flow.forms.list.fills.14',
  text: sql`select * from flow.fills where scope_id = $1::uuid and run_id = $2::uuid and task_id = $3::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills15 = defineQuery({
  name: 'flow.forms.list.fills.15',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and run_id = $3::uuid and task_id = $4::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills16 = defineQuery({
  name: 'flow.forms.list.fills.16',
  text: sql`select * from flow.fills where target_id = $1 order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills17 = defineQuery({
  name: 'flow.forms.list.fills.17',
  text: sql`select * from flow.fills where form_id = $1::uuid and target_id = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills18 = defineQuery({
  name: 'flow.forms.list.fills.18',
  text: sql`select * from flow.fills where scope_id = $1::uuid and target_id = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills19 = defineQuery({
  name: 'flow.forms.list.fills.19',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills20 = defineQuery({
  name: 'flow.forms.list.fills.20',
  text: sql`select * from flow.fills where run_id = $1::uuid and target_id = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills21 = defineQuery({
  name: 'flow.forms.list.fills.21',
  text: sql`select * from flow.fills where form_id = $1::uuid and run_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills22 = defineQuery({
  name: 'flow.forms.list.fills.22',
  text: sql`select * from flow.fills where scope_id = $1::uuid and run_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills23 = defineQuery({
  name: 'flow.forms.list.fills.23',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and run_id = $3::uuid and target_id = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills24 = defineQuery({
  name: 'flow.forms.list.fills.24',
  text: sql`select * from flow.fills where task_id = $1::uuid and target_id = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills25 = defineQuery({
  name: 'flow.forms.list.fills.25',
  text: sql`select * from flow.fills where form_id = $1::uuid and task_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills26 = defineQuery({
  name: 'flow.forms.list.fills.26',
  text: sql`select * from flow.fills where scope_id = $1::uuid and task_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills27 = defineQuery({
  name: 'flow.forms.list.fills.27',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and task_id = $3::uuid and target_id = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills28 = defineQuery({
  name: 'flow.forms.list.fills.28',
  text: sql`select * from flow.fills where run_id = $1::uuid and task_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills29 = defineQuery({
  name: 'flow.forms.list.fills.29',
  text: sql`select * from flow.fills where form_id = $1::uuid and run_id = $2::uuid and task_id = $3::uuid and target_id = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills30 = defineQuery({
  name: 'flow.forms.list.fills.30',
  text: sql`select * from flow.fills where scope_id = $1::uuid and run_id = $2::uuid and task_id = $3::uuid and target_id = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills31 = defineQuery({
  name: 'flow.forms.list.fills.31',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and run_id = $3::uuid and task_id = $4::uuid and target_id = $5 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills32 = defineQuery({
  name: 'flow.forms.list.fills.32',
  text: sql`select * from flow.fills where target_type = $1 order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills33 = defineQuery({
  name: 'flow.forms.list.fills.33',
  text: sql`select * from flow.fills where form_id = $1::uuid and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills34 = defineQuery({
  name: 'flow.forms.list.fills.34',
  text: sql`select * from flow.fills where scope_id = $1::uuid and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills35 = defineQuery({
  name: 'flow.forms.list.fills.35',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills36 = defineQuery({
  name: 'flow.forms.list.fills.36',
  text: sql`select * from flow.fills where run_id = $1::uuid and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills37 = defineQuery({
  name: 'flow.forms.list.fills.37',
  text: sql`select * from flow.fills where form_id = $1::uuid and run_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills38 = defineQuery({
  name: 'flow.forms.list.fills.38',
  text: sql`select * from flow.fills where scope_id = $1::uuid and run_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills39 = defineQuery({
  name: 'flow.forms.list.fills.39',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and run_id = $3::uuid and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills40 = defineQuery({
  name: 'flow.forms.list.fills.40',
  text: sql`select * from flow.fills where task_id = $1::uuid and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills41 = defineQuery({
  name: 'flow.forms.list.fills.41',
  text: sql`select * from flow.fills where form_id = $1::uuid and task_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills42 = defineQuery({
  name: 'flow.forms.list.fills.42',
  text: sql`select * from flow.fills where scope_id = $1::uuid and task_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills43 = defineQuery({
  name: 'flow.forms.list.fills.43',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and task_id = $3::uuid and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills44 = defineQuery({
  name: 'flow.forms.list.fills.44',
  text: sql`select * from flow.fills where run_id = $1::uuid and task_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills45 = defineQuery({
  name: 'flow.forms.list.fills.45',
  text: sql`select * from flow.fills where form_id = $1::uuid and run_id = $2::uuid and task_id = $3::uuid and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills46 = defineQuery({
  name: 'flow.forms.list.fills.46',
  text: sql`select * from flow.fills where scope_id = $1::uuid and run_id = $2::uuid and task_id = $3::uuid and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills47 = defineQuery({
  name: 'flow.forms.list.fills.47',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and run_id = $3::uuid and task_id = $4::uuid and target_type = $5 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills48 = defineQuery({
  name: 'flow.forms.list.fills.48',
  text: sql`select * from flow.fills where target_id = $1 and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills49 = defineQuery({
  name: 'flow.forms.list.fills.49',
  text: sql`select * from flow.fills where form_id = $1::uuid and target_id = $2 and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills50 = defineQuery({
  name: 'flow.forms.list.fills.50',
  text: sql`select * from flow.fills where scope_id = $1::uuid and target_id = $2 and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills51 = defineQuery({
  name: 'flow.forms.list.fills.51',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills52 = defineQuery({
  name: 'flow.forms.list.fills.52',
  text: sql`select * from flow.fills where run_id = $1::uuid and target_id = $2 and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills53 = defineQuery({
  name: 'flow.forms.list.fills.53',
  text: sql`select * from flow.fills where form_id = $1::uuid and run_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills54 = defineQuery({
  name: 'flow.forms.list.fills.54',
  text: sql`select * from flow.fills where scope_id = $1::uuid and run_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills55 = defineQuery({
  name: 'flow.forms.list.fills.55',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and run_id = $3::uuid and target_id = $4 and target_type = $5 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills56 = defineQuery({
  name: 'flow.forms.list.fills.56',
  text: sql`select * from flow.fills where task_id = $1::uuid and target_id = $2 and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills57 = defineQuery({
  name: 'flow.forms.list.fills.57',
  text: sql`select * from flow.fills where form_id = $1::uuid and task_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills58 = defineQuery({
  name: 'flow.forms.list.fills.58',
  text: sql`select * from flow.fills where scope_id = $1::uuid and task_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills59 = defineQuery({
  name: 'flow.forms.list.fills.59',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and task_id = $3::uuid and target_id = $4 and target_type = $5 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills60 = defineQuery({
  name: 'flow.forms.list.fills.60',
  text: sql`select * from flow.fills where run_id = $1::uuid and task_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills61 = defineQuery({
  name: 'flow.forms.list.fills.61',
  text: sql`select * from flow.fills where form_id = $1::uuid and run_id = $2::uuid and task_id = $3::uuid and target_id = $4 and target_type = $5 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills62 = defineQuery({
  name: 'flow.forms.list.fills.62',
  text: sql`select * from flow.fills where scope_id = $1::uuid and run_id = $2::uuid and task_id = $3::uuid and target_id = $4 and target_type = $5 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fills63 = defineQuery({
  name: 'flow.forms.list.fills.63',
  text: sql`select * from flow.fills where form_id = $1::uuid and scope_id = $2::uuid and run_id = $3::uuid and task_id = $4::uuid and target_id = $5 and target_type = $6 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

function executeFillsList(trx: Transaction, filters: Record<string, string>) {
  const mask = (Object.prototype.hasOwnProperty.call(filters, 'form_id') ? 1 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'scope_id') ? 2 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'run_id') ? 4 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'task_id') ? 8 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'target_id') ? 16 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'target_type') ? 32 : 0);
  switch (mask) {
    case 0:
      return trx.runGuarded(fills0, [], isFormsListRow);
    case 1:
      return trx.runGuarded(fills1, [filters.form_id], isFormsListRow);
    case 2:
      return trx.runGuarded(fills2, [filters.scope_id], isFormsListRow);
    case 3:
      return trx.runGuarded(fills3, [filters.form_id, filters.scope_id], isFormsListRow);
    case 4:
      return trx.runGuarded(fills4, [filters.run_id], isFormsListRow);
    case 5:
      return trx.runGuarded(fills5, [filters.form_id, filters.run_id], isFormsListRow);
    case 6:
      return trx.runGuarded(fills6, [filters.scope_id, filters.run_id], isFormsListRow);
    case 7:
      return trx.runGuarded(fills7, [filters.form_id, filters.scope_id, filters.run_id], isFormsListRow);
    case 8:
      return trx.runGuarded(fills8, [filters.task_id], isFormsListRow);
    case 9:
      return trx.runGuarded(fills9, [filters.form_id, filters.task_id], isFormsListRow);
    case 10:
      return trx.runGuarded(fills10, [filters.scope_id, filters.task_id], isFormsListRow);
    case 11:
      return trx.runGuarded(fills11, [filters.form_id, filters.scope_id, filters.task_id], isFormsListRow);
    case 12:
      return trx.runGuarded(fills12, [filters.run_id, filters.task_id], isFormsListRow);
    case 13:
      return trx.runGuarded(fills13, [filters.form_id, filters.run_id, filters.task_id], isFormsListRow);
    case 14:
      return trx.runGuarded(fills14, [filters.scope_id, filters.run_id, filters.task_id], isFormsListRow);
    case 15:
      return trx.runGuarded(fills15, [filters.form_id, filters.scope_id, filters.run_id, filters.task_id], isFormsListRow);
    case 16:
      return trx.runGuarded(fills16, [filters.target_id], isFormsListRow);
    case 17:
      return trx.runGuarded(fills17, [filters.form_id, filters.target_id], isFormsListRow);
    case 18:
      return trx.runGuarded(fills18, [filters.scope_id, filters.target_id], isFormsListRow);
    case 19:
      return trx.runGuarded(fills19, [filters.form_id, filters.scope_id, filters.target_id], isFormsListRow);
    case 20:
      return trx.runGuarded(fills20, [filters.run_id, filters.target_id], isFormsListRow);
    case 21:
      return trx.runGuarded(fills21, [filters.form_id, filters.run_id, filters.target_id], isFormsListRow);
    case 22:
      return trx.runGuarded(fills22, [filters.scope_id, filters.run_id, filters.target_id], isFormsListRow);
    case 23:
      return trx.runGuarded(fills23, [filters.form_id, filters.scope_id, filters.run_id, filters.target_id], isFormsListRow);
    case 24:
      return trx.runGuarded(fills24, [filters.task_id, filters.target_id], isFormsListRow);
    case 25:
      return trx.runGuarded(fills25, [filters.form_id, filters.task_id, filters.target_id], isFormsListRow);
    case 26:
      return trx.runGuarded(fills26, [filters.scope_id, filters.task_id, filters.target_id], isFormsListRow);
    case 27:
      return trx.runGuarded(fills27, [filters.form_id, filters.scope_id, filters.task_id, filters.target_id], isFormsListRow);
    case 28:
      return trx.runGuarded(fills28, [filters.run_id, filters.task_id, filters.target_id], isFormsListRow);
    case 29:
      return trx.runGuarded(fills29, [filters.form_id, filters.run_id, filters.task_id, filters.target_id], isFormsListRow);
    case 30:
      return trx.runGuarded(fills30, [filters.scope_id, filters.run_id, filters.task_id, filters.target_id], isFormsListRow);
    case 31:
      return trx.runGuarded(fills31, [filters.form_id, filters.scope_id, filters.run_id, filters.task_id, filters.target_id], isFormsListRow);
    case 32:
      return trx.runGuarded(fills32, [filters.target_type], isFormsListRow);
    case 33:
      return trx.runGuarded(fills33, [filters.form_id, filters.target_type], isFormsListRow);
    case 34:
      return trx.runGuarded(fills34, [filters.scope_id, filters.target_type], isFormsListRow);
    case 35:
      return trx.runGuarded(fills35, [filters.form_id, filters.scope_id, filters.target_type], isFormsListRow);
    case 36:
      return trx.runGuarded(fills36, [filters.run_id, filters.target_type], isFormsListRow);
    case 37:
      return trx.runGuarded(fills37, [filters.form_id, filters.run_id, filters.target_type], isFormsListRow);
    case 38:
      return trx.runGuarded(fills38, [filters.scope_id, filters.run_id, filters.target_type], isFormsListRow);
    case 39:
      return trx.runGuarded(fills39, [filters.form_id, filters.scope_id, filters.run_id, filters.target_type], isFormsListRow);
    case 40:
      return trx.runGuarded(fills40, [filters.task_id, filters.target_type], isFormsListRow);
    case 41:
      return trx.runGuarded(fills41, [filters.form_id, filters.task_id, filters.target_type], isFormsListRow);
    case 42:
      return trx.runGuarded(fills42, [filters.scope_id, filters.task_id, filters.target_type], isFormsListRow);
    case 43:
      return trx.runGuarded(fills43, [filters.form_id, filters.scope_id, filters.task_id, filters.target_type], isFormsListRow);
    case 44:
      return trx.runGuarded(fills44, [filters.run_id, filters.task_id, filters.target_type], isFormsListRow);
    case 45:
      return trx.runGuarded(fills45, [filters.form_id, filters.run_id, filters.task_id, filters.target_type], isFormsListRow);
    case 46:
      return trx.runGuarded(fills46, [filters.scope_id, filters.run_id, filters.task_id, filters.target_type], isFormsListRow);
    case 47:
      return trx.runGuarded(fills47, [filters.form_id, filters.scope_id, filters.run_id, filters.task_id, filters.target_type], isFormsListRow);
    case 48:
      return trx.runGuarded(fills48, [filters.target_id, filters.target_type], isFormsListRow);
    case 49:
      return trx.runGuarded(fills49, [filters.form_id, filters.target_id, filters.target_type], isFormsListRow);
    case 50:
      return trx.runGuarded(fills50, [filters.scope_id, filters.target_id, filters.target_type], isFormsListRow);
    case 51:
      return trx.runGuarded(fills51, [filters.form_id, filters.scope_id, filters.target_id, filters.target_type], isFormsListRow);
    case 52:
      return trx.runGuarded(fills52, [filters.run_id, filters.target_id, filters.target_type], isFormsListRow);
    case 53:
      return trx.runGuarded(fills53, [filters.form_id, filters.run_id, filters.target_id, filters.target_type], isFormsListRow);
    case 54:
      return trx.runGuarded(fills54, [filters.scope_id, filters.run_id, filters.target_id, filters.target_type], isFormsListRow);
    case 55:
      return trx.runGuarded(fills55, [filters.form_id, filters.scope_id, filters.run_id, filters.target_id, filters.target_type], isFormsListRow);
    case 56:
      return trx.runGuarded(fills56, [filters.task_id, filters.target_id, filters.target_type], isFormsListRow);
    case 57:
      return trx.runGuarded(fills57, [filters.form_id, filters.task_id, filters.target_id, filters.target_type], isFormsListRow);
    case 58:
      return trx.runGuarded(fills58, [filters.scope_id, filters.task_id, filters.target_id, filters.target_type], isFormsListRow);
    case 59:
      return trx.runGuarded(fills59, [filters.form_id, filters.scope_id, filters.task_id, filters.target_id, filters.target_type], isFormsListRow);
    case 60:
      return trx.runGuarded(fills60, [filters.run_id, filters.task_id, filters.target_id, filters.target_type], isFormsListRow);
    case 61:
      return trx.runGuarded(fills61, [filters.form_id, filters.run_id, filters.task_id, filters.target_id, filters.target_type], isFormsListRow);
    case 62:
      return trx.runGuarded(fills62, [filters.scope_id, filters.run_id, filters.task_id, filters.target_id, filters.target_type], isFormsListRow);
    case 63:
      return trx.runGuarded(fills63, [filters.form_id, filters.scope_id, filters.run_id, filters.task_id, filters.target_id, filters.target_type], isFormsListRow);
    default:
      throw new RangeError('Invalid fills list filter mask');
  }
}

const answers1 = defineQuery({
  name: 'flow.forms.list.answers.1',
  text: sql`select * from flow.answers where fill_id = $1::uuid order by created_at, id`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

function executeAnswersList(trx: Transaction, filters: Record<string, string>) {
  return trx.runGuarded(answers1, [filters.fill_id], isFormsListRow);
}

const waivers0 = defineQuery({
  name: 'flow.forms.list.waivers.0',
  text: sql`select * from flow.waivers order by created_at desc`,
  params: z.tuple([]),
  row: opaqueRow,
  expects: 'many',
});

const waivers1 = defineQuery({
  name: 'flow.forms.list.waivers.1',
  text: sql`select * from flow.waivers where scope_id = $1::uuid order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers2 = defineQuery({
  name: 'flow.forms.list.waivers.2',
  text: sql`select * from flow.waivers where form_id = $1::uuid order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers3 = defineQuery({
  name: 'flow.forms.list.waivers.3',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and form_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers4 = defineQuery({
  name: 'flow.forms.list.waivers.4',
  text: sql`select * from flow.waivers where question_id = $1::uuid order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers5 = defineQuery({
  name: 'flow.forms.list.waivers.5',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and question_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers6 = defineQuery({
  name: 'flow.forms.list.waivers.6',
  text: sql`select * from flow.waivers where form_id = $1::uuid and question_id = $2::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers7 = defineQuery({
  name: 'flow.forms.list.waivers.7',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and form_id = $2::uuid and question_id = $3::uuid order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers8 = defineQuery({
  name: 'flow.forms.list.waivers.8',
  text: sql`select * from flow.waivers where target_id = $1 order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers9 = defineQuery({
  name: 'flow.forms.list.waivers.9',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and target_id = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers10 = defineQuery({
  name: 'flow.forms.list.waivers.10',
  text: sql`select * from flow.waivers where form_id = $1::uuid and target_id = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers11 = defineQuery({
  name: 'flow.forms.list.waivers.11',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and form_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers12 = defineQuery({
  name: 'flow.forms.list.waivers.12',
  text: sql`select * from flow.waivers where question_id = $1::uuid and target_id = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers13 = defineQuery({
  name: 'flow.forms.list.waivers.13',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and question_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers14 = defineQuery({
  name: 'flow.forms.list.waivers.14',
  text: sql`select * from flow.waivers where form_id = $1::uuid and question_id = $2::uuid and target_id = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers15 = defineQuery({
  name: 'flow.forms.list.waivers.15',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and form_id = $2::uuid and question_id = $3::uuid and target_id = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers16 = defineQuery({
  name: 'flow.forms.list.waivers.16',
  text: sql`select * from flow.waivers where target_type = $1 order by created_at desc`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers17 = defineQuery({
  name: 'flow.forms.list.waivers.17',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers18 = defineQuery({
  name: 'flow.forms.list.waivers.18',
  text: sql`select * from flow.waivers where form_id = $1::uuid and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers19 = defineQuery({
  name: 'flow.forms.list.waivers.19',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and form_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers20 = defineQuery({
  name: 'flow.forms.list.waivers.20',
  text: sql`select * from flow.waivers where question_id = $1::uuid and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers21 = defineQuery({
  name: 'flow.forms.list.waivers.21',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and question_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers22 = defineQuery({
  name: 'flow.forms.list.waivers.22',
  text: sql`select * from flow.waivers where form_id = $1::uuid and question_id = $2::uuid and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers23 = defineQuery({
  name: 'flow.forms.list.waivers.23',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and form_id = $2::uuid and question_id = $3::uuid and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers24 = defineQuery({
  name: 'flow.forms.list.waivers.24',
  text: sql`select * from flow.waivers where target_id = $1 and target_type = $2 order by created_at desc`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers25 = defineQuery({
  name: 'flow.forms.list.waivers.25',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and target_id = $2 and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers26 = defineQuery({
  name: 'flow.forms.list.waivers.26',
  text: sql`select * from flow.waivers where form_id = $1::uuid and target_id = $2 and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers27 = defineQuery({
  name: 'flow.forms.list.waivers.27',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and form_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers28 = defineQuery({
  name: 'flow.forms.list.waivers.28',
  text: sql`select * from flow.waivers where question_id = $1::uuid and target_id = $2 and target_type = $3 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers29 = defineQuery({
  name: 'flow.forms.list.waivers.29',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and question_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers30 = defineQuery({
  name: 'flow.forms.list.waivers.30',
  text: sql`select * from flow.waivers where form_id = $1::uuid and question_id = $2::uuid and target_id = $3 and target_type = $4 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const waivers31 = defineQuery({
  name: 'flow.forms.list.waivers.31',
  text: sql`select * from flow.waivers where scope_id = $1::uuid and form_id = $2::uuid and question_id = $3::uuid and target_id = $4 and target_type = $5 order by created_at desc`,
  params: z.tuple([selectedText, selectedText, selectedText, selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

function executeWaiversList(trx: Transaction, filters: Record<string, string>) {
  const mask = (Object.prototype.hasOwnProperty.call(filters, 'scope_id') ? 1 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'form_id') ? 2 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'question_id') ? 4 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'target_id') ? 8 : 0) | (Object.prototype.hasOwnProperty.call(filters, 'target_type') ? 16 : 0);
  switch (mask) {
    case 0:
      return trx.runGuarded(waivers0, [], isFormsListRow);
    case 1:
      return trx.runGuarded(waivers1, [filters.scope_id], isFormsListRow);
    case 2:
      return trx.runGuarded(waivers2, [filters.form_id], isFormsListRow);
    case 3:
      return trx.runGuarded(waivers3, [filters.scope_id, filters.form_id], isFormsListRow);
    case 4:
      return trx.runGuarded(waivers4, [filters.question_id], isFormsListRow);
    case 5:
      return trx.runGuarded(waivers5, [filters.scope_id, filters.question_id], isFormsListRow);
    case 6:
      return trx.runGuarded(waivers6, [filters.form_id, filters.question_id], isFormsListRow);
    case 7:
      return trx.runGuarded(waivers7, [filters.scope_id, filters.form_id, filters.question_id], isFormsListRow);
    case 8:
      return trx.runGuarded(waivers8, [filters.target_id], isFormsListRow);
    case 9:
      return trx.runGuarded(waivers9, [filters.scope_id, filters.target_id], isFormsListRow);
    case 10:
      return trx.runGuarded(waivers10, [filters.form_id, filters.target_id], isFormsListRow);
    case 11:
      return trx.runGuarded(waivers11, [filters.scope_id, filters.form_id, filters.target_id], isFormsListRow);
    case 12:
      return trx.runGuarded(waivers12, [filters.question_id, filters.target_id], isFormsListRow);
    case 13:
      return trx.runGuarded(waivers13, [filters.scope_id, filters.question_id, filters.target_id], isFormsListRow);
    case 14:
      return trx.runGuarded(waivers14, [filters.form_id, filters.question_id, filters.target_id], isFormsListRow);
    case 15:
      return trx.runGuarded(waivers15, [filters.scope_id, filters.form_id, filters.question_id, filters.target_id], isFormsListRow);
    case 16:
      return trx.runGuarded(waivers16, [filters.target_type], isFormsListRow);
    case 17:
      return trx.runGuarded(waivers17, [filters.scope_id, filters.target_type], isFormsListRow);
    case 18:
      return trx.runGuarded(waivers18, [filters.form_id, filters.target_type], isFormsListRow);
    case 19:
      return trx.runGuarded(waivers19, [filters.scope_id, filters.form_id, filters.target_type], isFormsListRow);
    case 20:
      return trx.runGuarded(waivers20, [filters.question_id, filters.target_type], isFormsListRow);
    case 21:
      return trx.runGuarded(waivers21, [filters.scope_id, filters.question_id, filters.target_type], isFormsListRow);
    case 22:
      return trx.runGuarded(waivers22, [filters.form_id, filters.question_id, filters.target_type], isFormsListRow);
    case 23:
      return trx.runGuarded(waivers23, [filters.scope_id, filters.form_id, filters.question_id, filters.target_type], isFormsListRow);
    case 24:
      return trx.runGuarded(waivers24, [filters.target_id, filters.target_type], isFormsListRow);
    case 25:
      return trx.runGuarded(waivers25, [filters.scope_id, filters.target_id, filters.target_type], isFormsListRow);
    case 26:
      return trx.runGuarded(waivers26, [filters.form_id, filters.target_id, filters.target_type], isFormsListRow);
    case 27:
      return trx.runGuarded(waivers27, [filters.scope_id, filters.form_id, filters.target_id, filters.target_type], isFormsListRow);
    case 28:
      return trx.runGuarded(waivers28, [filters.question_id, filters.target_id, filters.target_type], isFormsListRow);
    case 29:
      return trx.runGuarded(waivers29, [filters.scope_id, filters.question_id, filters.target_id, filters.target_type], isFormsListRow);
    case 30:
      return trx.runGuarded(waivers30, [filters.form_id, filters.question_id, filters.target_id, filters.target_type], isFormsListRow);
    case 31:
      return trx.runGuarded(waivers31, [filters.scope_id, filters.form_id, filters.question_id, filters.target_id, filters.target_type], isFormsListRow);
    default:
      throw new RangeError('Invalid waivers list filter mask');
  }
}

export function executeFormsList(trx: Transaction, key: FormsListKey, filters: Record<string, string>) {
  switch (key) {
    case 'forms': return executeFormDefinitionsList(trx, filters);
    case 'questions': return executeQuestionsList(trx, filters);
    case 'fills': return executeFillsList(trx, filters);
    case 'answers': return executeAnswersList(trx, filters);
    case 'waivers': return executeWaiversList(trx, filters);
  }
}
