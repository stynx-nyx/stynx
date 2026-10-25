import { BadRequestException, NotFoundException } from '@nestjs/common';
import { executeGuardedQueryRows, executeTypedQuery, QueryRowValidationError, type Transaction } from '@stynx-nyx/data';
import { FlowFormsService } from '../../src/flow-forms.service.js';

const ID = '0190abcd-1234-7abc-89ab-000000000001';
const FORM = '0190abcd-1234-7abc-89ab-000000000002';
const QUESTION = '0190abcd-1234-7abc-89ab-000000000003';
const SECOND = '0190abcd-1234-7abc-89ab-000000000004';
type Step = { rows: unknown[]; rowCount?: number } | Error;

function harness(steps: Step[], tenantId?: string) {
  const events: string[] = [];
  let index = 0;
  const query = vi.fn(async (_sql: string, _params?: unknown[]) => {
    events.push('query');
    const next = steps[index++];
    if (next === undefined) throw new Error('Unexpected query');
    if (next instanceof Error) throw next;
    return next;
  });
  const run: Transaction['run'] = (statement, params) => executeTypedQuery({ query }, statement, params);
  const runGuarded: Transaction['runGuarded'] = (statement, params, guard) => executeGuardedQueryRows({ query }, statement, params, guard);
  const softDelete = vi.fn(async () => undefined);
  const trx = { query, run, runGuarded, softDelete };
  const tx = vi.fn(async (callback: (transaction: typeof trx) => unknown, _options?: unknown) => {
    events.push('tx');
    return callback(trx);
  });
  const context = {
    get tenantId() { events.push('tenant'); return tenantId; },
    get actorId() { events.push('actor'); return null; },
  };
  return { service: new FlowFormsService({ tx } as never, context as never), query, tx, softDelete, events };
}

const reads = [
  { name: 'form', invoke: (s: FlowFormsService) => s.getForm(ID), sql: 'select * from flow.forms where id = $1::uuid limit 1', params: [ID], message: 'Flow row not found' },
  { name: 'question', invoke: (s: FlowFormsService) => s.getQuestion(ID), sql: 'select * from flow.questions where id = $1::uuid limit 1', params: [ID], message: 'Flow row not found' },
  { name: 'fill', invoke: (s: FlowFormsService) => s.getFill(ID), sql: 'select * from flow.fills where id = $1::uuid limit 1', params: [ID], message: 'Flow row not found' },
  { name: 'score', invoke: (s: FlowFormsService) => s.getQuestionScore(ID), sql: 'select * from flow.scores where question_id = $1::uuid limit 1', params: [ID], message: 'Question score not found' },
  { name: 'form-fill', invoke: (s: FlowFormsService) => s.getFormFill(FORM, ID), sql: 'select * from flow.fills where form_id = $1::uuid and id = $2::uuid limit 1', params: [FORM, ID], message: 'Fill not found' },
];
const tables = ['forms', 'questions', 'scores', 'fills', 'answers', 'waivers'] as const;
const existsSql = (table: typeof tables[number]) => `select exists(select 1 from flow.${table} where id = $1::uuid) as exists`;

describe('five actual forms fixed reads before static conversion', () => {
  it.each(reads)('$name preserves exact SQL, binds, readonly reader and opaque selected keys', async ({ invoke, sql, params }) => {
    const nested = { bigint: 1n, absent: undefined, date: new Date(0) };
    const row = Object.assign(Object.create({ inherited_value: 'ignored' }), { id: ID, selected_value: nested });
    Object.defineProperty(row, '__proto__', { value: nested, enumerable: true });
    const h = harness([{ rows: [row, { id: SECOND }], rowCount: 0 }]);
    const result = await invoke(h.service);
    expect(Object.keys(result)).toEqual(['id', 'selectedValue', '_Proto__']);
    expect(result.id).toBe(ID);
    expect(result.selectedValue).toBe(nested);
    expect(result._Proto__).toBe(nested);
    expect(h.query).toHaveBeenCalledExactlyOnceWith(sql, params);
    expect(h.tx).toHaveBeenCalledExactlyOnceWith(expect.any(Function), { role: 'reader', readonly: true });
    expect(h.events).toEqual(['tx', 'query']);
    console.log('FORMS_FIXED_GET_BASELINE ' + JSON.stringify({ sql, params }));
  });

  for (const read of reads) {
    it.each([undefined, null, false, 0, '', NaN].map((first) => ({ first })))(`${read.name} refuses malformed first row %# despite a second row and positive rowCount`, async ({ first }) => {
      const h = harness([{ rows: [first, { id: SECOND }], rowCount: 2 }]);
      const error: unknown = await read.invoke(h.service).catch((failure: unknown) => failure);
      expect(error).toBeInstanceOf(QueryRowValidationError);
      expect(error).toMatchObject({ rowIndex: 0 });
      expect(JSON.stringify(error)).not.toContain('driver-secret');
      expect(h.query).toHaveBeenCalledOnce();
    });
  }

  it.each(reads)('$name validates a malformed later row before exposing an earlier valid row', async ({ invoke }) => {
    const h = harness([{ rows: [{ id: ID }, ['driver-secret']], rowCount: 2 }]);
    const error: unknown = await invoke(h.service).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(QueryRowValidationError);
    expect(error).toMatchObject({ rowIndex: 1 });
    expect(JSON.stringify(error)).not.toContain('driver-secret');
    expect(h.query).toHaveBeenCalledOnce();
  });

  it.each(reads)('$name missing rows retain its exact caller error', async ({ invoke, message }) => {
    const h = harness([{ rows: [], rowCount: 99 }]);
    await expect(invoke(h.service)).rejects.toThrow(new NotFoundException(message));
  });

  it.each(reads)('$name propagates driver failure by identity', async ({ invoke }) => {
    const marker = new Error('driver');
    const h = harness([marker]);
    await expect(invoke(h.service)).rejects.toBe(marker);
    expect(h.query).toHaveBeenCalledOnce();
  });

  it('public fixed-read inputs retain their existing plain-string bind contract', async () => {
    const h = harness([{ rows: [{}] }, { rows: [{}] }]);
    expect(await h.service.getForm(' not-a-uuid ')).toEqual({});
    expect(await h.service.getFormFill('', 'bad-id')).toEqual({});
    expect(h.query.mock.calls).toEqual([[reads[0]!.sql, [' not-a-uuid ']], [reads[4]!.sql, ['', 'bad-id']]]);
  });
});

describe('six existence reads preserve first-row boolean and caller ordering', () => {
  // Original table identity/precheck/delete errors remain covered by soft-delete-table-identity.spec.ts.
  it.each(tables)('%s accepts first true even with rowCount zero and a later false', async (table) => {
    const h = harness([{ rows: [{ exists: true }, { exists: false }], rowCount: 0 }]);
    await expect(h.service['softDeleteRow'](table, ID)).resolves.toEqual({ id: ID, deleted: true });
    expect(h.query).toHaveBeenCalledExactlyOnceWith(existsSql(table), [ID]);
    expect(h.softDelete).toHaveBeenCalledOnce();
    console.log('FORMS_FIXED_EXISTS_BASELINE ' + JSON.stringify({ sql: existsSql(table), params: [ID] }));
  });

  it.each(tables)('%s rejects first false even with rowCount positive and a later true', async (table) => {
    const h = harness([{ rows: [{ exists: false }, { exists: true }], rowCount: 2 }]);
    await expect(h.service['softDeleteRow'](table, ID)).rejects.toThrow(new NotFoundException('Flow row not found'));
    expect(h.softDelete).not.toHaveBeenCalled();
  });

  it('score precheck missing row wins over absent tenant; successful check reaches tenant refusal', async () => {
    const missing = harness([{ rows: [{ exists: false }] }]);
    await expect(missing.service.putQuestionScore(QUESTION, {})).rejects.toThrow(new NotFoundException('Question not found'));
    expect(missing.events).toEqual(['tx', 'query']);
    const found = harness([{ rows: [{ exists: true }] }]);
    await expect(found.service.putQuestionScore(QUESTION, {})).rejects.toThrow(new BadRequestException('Tenant context is required'));
    expect(found.events).toEqual(['tx', 'query', 'tenant']);
    expect(found.query).toHaveBeenCalledExactlyOnceWith(existsSql('questions'), [QUESTION]);
  });

  it('answer checks fill then question before tenant, retaining each missing-row message', async () => {
    const missingFill = harness([{ rows: [{ exists: false }] }]);
    await expect(missingFill.service.upsertAnswer(ID, { questionId: QUESTION })).rejects.toThrow(new NotFoundException('Fill not found'));
    expect(missingFill.events).toEqual(['tx', 'query']);
    const missingQuestion = harness([{ rows: [{ exists: true }] }, { rows: [{ exists: false }] }]);
    await expect(missingQuestion.service.upsertAnswer(ID, { questionId: QUESTION })).rejects.toThrow(new NotFoundException('Question not found'));
    expect(missingQuestion.events).toEqual(['tx', 'query', 'query']);
    expect(missingQuestion.query.mock.calls).toEqual([[existsSql('fills'), [ID]], [existsSql('questions'), [QUESTION]]]);
    const found = harness([{ rows: [{ exists: true }] }, { rows: [{ exists: true }] }]);
    await expect(found.service.upsertAnswer(ID, { questionId: QUESTION })).rejects.toThrow(new BadRequestException('Tenant context is required'));
    expect(found.events).toEqual(['tx', 'query', 'query', 'tenant']);
  });

  it('bulk checks tenant after fill but before any per-answer question checks', async () => {
    const h = harness([{ rows: [{ exists: true }] }]);
    await expect(h.service.bulkUpsertAnswers(ID, [{ questionId: QUESTION }])).rejects.toThrow(new BadRequestException('Tenant context is required'));
    expect(h.query).toHaveBeenCalledExactlyOnceWith(existsSql('fills'), [ID]);
    expect(h.events).toEqual(['tx', 'query', 'tenant']);
  });

  it('bulk questions and writes remain sequential and stop at the next failed question', async () => {
    const h = harness([
      { rows: [{ exists: true }] }, { rows: [{ exists: true }] },
      { rows: [{ answer_value: 'first' }] }, { rows: [{ exists: false }] },
    ], FORM);
    await expect(h.service.bulkUpsertAnswers(ID, [
      { questionId: QUESTION, value: 'first' }, { questionId: SECOND, value: 'second' },
    ])).rejects.toThrow(new NotFoundException('Question not found'));
    expect(h.query).toHaveBeenCalledTimes(4);
    expect(h.query.mock.calls[0]).toEqual([existsSql('fills'), [ID]]);
    expect(h.query.mock.calls[1]).toEqual([existsSql('questions'), [QUESTION]]);
    expect(h.query.mock.calls[2]?.[1]).toEqual([FORM, ID, QUESTION, 'first', null, null]);
    expect(h.query.mock.calls[3]).toEqual([existsSql('questions'), [SECOND]]);
    expect(h.events).toEqual(['tx', 'query', 'tenant', 'actor', 'query', 'query', 'query']);
  });

  it('updated answer question precheck failure prevents the later update statement', async () => {
    const h = harness([{ rows: [{ exists: false }] }]);
    await expect(h.service.updateAnswer(ID, { questionId: QUESTION, value: 'new' })).rejects.toThrow(new NotFoundException('Question not found'));
    expect(h.query).toHaveBeenCalledExactlyOnceWith(existsSql('questions'), [QUESTION]);
    expect(h.events).toEqual(['tx', 'query']);
  });

  it('second answer precheck preserves driver failure identity without tenant access', async () => {
    const marker = new Error('question read');
    const h = harness([{ rows: [{ exists: true }] }, marker]);
    await expect(h.service.upsertAnswer(ID, { questionId: QUESTION })).rejects.toBe(marker);
    expect(h.events).toEqual(['tx', 'query', 'query']);
  });
});
