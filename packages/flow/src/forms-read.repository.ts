import { defineQuery, sql, type Transaction } from '@stynx-nyx/data';
import { z } from 'zod';
import type { FormTableKey } from './internal/forms/form-tables.js';

// Wildcard reads retain opaque fields in the guarded original row. The schema
// validates the enclosing object without reading columns before camelization.
const opaqueRow = z.object({});
const existsRow = z.object({ exists: z.boolean() });
const selectedText = z.unknown().pipe(z.string());

function isFormsReadRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const formById = defineQuery({
  name: 'flow.forms.read.formById',
  text: sql`select * from flow.forms where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const questionById = defineQuery({
  name: 'flow.forms.read.questionById',
  text: sql`select * from flow.questions where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fillById = defineQuery({
  name: 'flow.forms.read.fillById',
  text: sql`select * from flow.fills where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const scoreByQuestion = defineQuery({
  name: 'flow.forms.read.scoreByQuestion',
  text: sql`select * from flow.scores where question_id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const fillByFormAndId = defineQuery({
  name: 'flow.forms.read.fillByFormAndId',
  text: sql`select * from flow.fills where form_id = $1::uuid and id = $2::uuid limit 1`,
  params: z.tuple([selectedText, selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const formsExists = defineQuery({
  name: 'flow.forms.exists.forms',
  text: sql`select exists(select 1 from flow.forms where id = $1::uuid) as exists`,
  params: z.tuple([selectedText]),
  row: existsRow,
  expects: 'many',
});

const questionsExists = defineQuery({
  name: 'flow.forms.exists.questions',
  text: sql`select exists(select 1 from flow.questions where id = $1::uuid) as exists`,
  params: z.tuple([selectedText]),
  row: existsRow,
  expects: 'many',
});

const scoresExists = defineQuery({
  name: 'flow.forms.exists.scores',
  text: sql`select exists(select 1 from flow.scores where id = $1::uuid) as exists`,
  params: z.tuple([selectedText]),
  row: existsRow,
  expects: 'many',
});

const fillsExists = defineQuery({
  name: 'flow.forms.exists.fills',
  text: sql`select exists(select 1 from flow.fills where id = $1::uuid) as exists`,
  params: z.tuple([selectedText]),
  row: existsRow,
  expects: 'many',
});

const answersExists = defineQuery({
  name: 'flow.forms.exists.answers',
  text: sql`select exists(select 1 from flow.answers where id = $1::uuid) as exists`,
  params: z.tuple([selectedText]),
  row: existsRow,
  expects: 'many',
});

const waiversExists = defineQuery({
  name: 'flow.forms.exists.waivers',
  text: sql`select exists(select 1 from flow.waivers where id = $1::uuid) as exists`,
  params: z.tuple([selectedText]),
  row: existsRow,
  expects: 'many',
});

export type FormsFixedRead = 'forms' | 'questions' | 'fills' | 'scores' | 'formFill';

export function executeFormsFixedRead(trx: Transaction, key: FormsFixedRead, id: string, secondId?: string) {
  switch (key) {
    case 'forms':
      return trx.runGuarded(formById, [id], isFormsReadRow);
    case 'questions':
      return trx.runGuarded(questionById, [id], isFormsReadRow);
    case 'fills':
      return trx.runGuarded(fillById, [id], isFormsReadRow);
    case 'scores':
      return trx.runGuarded(scoreByQuestion, [id], isFormsReadRow);
    case 'formFill':
      return trx.runGuarded(fillByFormAndId, [id, secondId], isFormsReadRow);
  }
}

export function executeFormsExists(trx: Transaction, key: FormTableKey, id: string) {
  switch (key) {
    case 'forms':
      return trx.run(formsExists, [id]);
    case 'questions':
      return trx.run(questionsExists, [id]);
    case 'scores':
      return trx.run(scoresExists, [id]);
    case 'fills':
      return trx.run(fillsExists, [id]);
    case 'answers':
      return trx.run(answersExists, [id]);
    case 'waivers':
      return trx.run(waiversExists, [id]);
  }
}
