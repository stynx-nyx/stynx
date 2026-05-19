import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FlowFormsService } from '../../src/flow-forms.service';
import type { Mock } from 'vitest';

interface FakeTrx {
  query: Mock<Promise<{ rows: unknown[] }>, [string, unknown[]?]>;
  softDelete: Mock<Promise<void>, [unknown, string]>;
}

const SCOPE = '0190abcd-1234-7abc-89ab-000000000001';
const FORM = '0190abcd-1234-7abc-89ab-000000000002';
const FILL = '0190abcd-1234-7abc-89ab-000000000003';
const QUESTION = '0190abcd-1234-7abc-89ab-000000000004';
const ANSWER = '0190abcd-1234-7abc-89ab-000000000005';
const WAIVER = '0190abcd-1234-7abc-89ab-000000000006';
const SCORE = '0190abcd-1234-7abc-89ab-000000000007';

function makeTrx(rowsByCall: Array<unknown[]> = []) {
  let callIdx = 0;
  return {
    query: vi.fn(async () => ({ rows: rowsByCall[callIdx++] ?? [] })),
    softDelete: vi.fn(async () => undefined),
  } as FakeTrx;
}

function makeDb(rowsByCall: Array<unknown[]> = []) {
  const trx = makeTrx(rowsByCall);
  return {
    db: {
      tx: vi.fn(async (fn: (t: FakeTrx) => unknown) => fn(trx)),
    } as never,
    trx,
  };
}

function makeService(
  rowsByCall: Array<unknown[]> = [],
  ctx: { tenantId?: string; actorId?: string } = { tenantId: 't-1', actorId: 'u-1' },
) {
  const { db, trx } = makeDb(rowsByCall);
  return {
    service: new FlowFormsService(db, ctx as never),
    trx,
    db,
  };
}

describe('FlowFormsService', () => {
  describe('forms CRUD', () => {
    it('listForms scopes by scope_id when provided', async () => {
      const { service, trx } = makeService([[{ id: 'f-1', scope_id: SCOPE }]]);
      const result = await service.listForms(SCOPE);
      expect(result[0]).toMatchObject({ id: 'f-1' });
      const [sql, params] = trx.query.mock.calls[0]!;
      expect(sql).toContain('flow.forms');
      expect(sql).toContain('scope_id = $1::uuid');
      expect(params).toEqual([SCOPE]);
    });

    it('listForms without scopeId omits WHERE', async () => {
      const { service, trx } = makeService([[]]);
      await service.listForms();
      const [sql] = trx.query.mock.calls[0]!;
      expect(sql).not.toContain('where');
    });

    it('getForm returns row by id', async () => {
      const { service } = makeService([[{ id: FORM, title: 't' }]]);
      const result = await service.getForm(FORM);
      expect(result).toMatchObject({ id: FORM, title: 't' });
    });

    it('getForm throws NotFoundException when missing', async () => {
      const { service } = makeService([[]]);
      await expect(service.getForm(FORM)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('createForm INSERTs and returns the new row', async () => {
      const { service, trx } = makeService([[{ id: FORM, code: 'C', title: 'T' }]]);
      const result = await service.createForm({
        scopeId: SCOPE,
        code: 'C',
        title: 'T',
      });
      expect(result).toMatchObject({ id: FORM, code: 'C' });
      const [sql] = trx.query.mock.calls[0]!;
      expect(sql).toContain('insert into flow.forms');
    });

    it('updateRow throws BadRequest when no updatable column fields are present (waiver delete)', async () => {
      // Waivers don't have actorColumns; an updateWaiver with {} produces zero
      // rowEntries which is the BadRequest branch in updateRowInTx.
      const { service } = makeService([[]]);
      await expect(service.updateWaiver(WAIVER, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('updateForm throws NotFoundException when no row returned', async () => {
      const { service } = makeService([[]]);
      await expect(service.updateForm(FORM, { title: 'New' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('updateForm returns the camelized updated row', async () => {
      const { service } = makeService([[{ id: FORM, title: 'New' }]]);
      const result = await service.updateForm(FORM, { title: 'New' });
      expect(result).toMatchObject({ id: FORM, title: 'New' });
    });

    it('deleteForm asserts existence then calls trx.softDelete', async () => {
      const { service, trx } = makeService([
        [{ exists: true }],
      ]);
      const result = await service.deleteForm(FORM);
      expect(trx.softDelete).toHaveBeenCalled();
      expect(result).toEqual({ id: FORM, deleted: true });
    });

    it('deleteForm throws NotFoundException when row does not exist', async () => {
      const { service } = makeService([[{ exists: false }]]);
      await expect(service.deleteForm(FORM)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('questions / scores', () => {
    it('listQuestions filters by form_id', async () => {
      const { service, trx } = makeService([[]]);
      await service.listQuestions(FORM);
      const [sql, params] = trx.query.mock.calls[0]!;
      expect(sql).toContain('form_id = $1::uuid');
      expect(params).toEqual([FORM]);
    });

    it('createQuestion attaches formId to the input', async () => {
      const { service, trx } = makeService([[{ id: QUESTION, form_id: FORM }]]);
      const result = await service.createQuestion(FORM, {
        key: 'k',
        label: 'L',
        fieldType: 'text',
      });
      expect(result.id).toBe(QUESTION);
      const params = trx.query.mock.calls[0]?.[1] as unknown[];
      expect(params).toContain(FORM);
    });

    it('createQuestion rejects non-object input', () => {
      const { service } = makeService([]);
      expect(() => service.createQuestion(FORM, null)).toThrow(BadRequestException);
    });

    it('question get, update, and delete methods route through shared helpers', async () => {
      const get = makeService([[{ id: QUESTION }]]);
      await expect(get.service.getQuestion(QUESTION)).resolves.toMatchObject({ id: QUESTION });

      const update = makeService([[{ id: QUESTION, label: 'Updated' }]]);
      await expect(update.service.updateQuestion(QUESTION, { label: 'Updated' })).resolves.toMatchObject({
        id: QUESTION,
        label: 'Updated',
      });

      const del = makeService([[{ exists: true }]]);
      await expect(del.service.deleteQuestion(QUESTION)).resolves.toEqual({
        id: QUESTION,
        deleted: true,
      });
      expect(del.trx.softDelete).toHaveBeenCalled();
    });

    it('putQuestionScore upserts and returns the camelized row', async () => {
      const { service, trx } = makeService([
        [{ exists: true }],
        [{ id: SCORE, question_id: QUESTION, pass_points: '3', fail_points: '0' }],
      ]);
      const result = await service.putQuestionScore(QUESTION, { passPoints: '3' });
      expect(result).toMatchObject({ questionId: QUESTION, passPoints: '3' });
      const [sqlUpsert] = trx.query.mock.calls[1]!;
      expect(sqlUpsert).toContain('insert into flow.scores');
    });

    it('putQuestionScore defaults scores and nullable actor when omitted', async () => {
      const { service, trx } = makeService([
        [{ exists: true }],
        [],
      ], { tenantId: 't-1' });
      await expect(service.putQuestionScore(QUESTION, {})).resolves.toEqual({});
      expect(trx.query.mock.calls[1]?.[1]).toEqual(['t-1', QUESTION, '1', '0', {}, null]);
    });

    it('putQuestionScore propagates NotFound from assertExists', async () => {
      const { service } = makeService([[{ exists: false }]]);
      await expect(service.putQuestionScore(QUESTION, { passPoints: '3' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('getQuestionScore returns one row or throws NotFound', async () => {
      const found = makeService([[{ id: SCORE }]]);
      await expect(found.service.getQuestionScore(QUESTION)).resolves.toMatchObject({ id: SCORE });
      const missing = makeService([[]]);
      await expect(missing.service.getQuestionScore(QUESTION)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deleteQuestionScore looks up then softDeletes the score row', async () => {
      const { service, trx } = makeService([
        [{ id: SCORE }],
        [{ exists: true }],
      ]);
      await expect(service.deleteQuestionScore(QUESTION)).resolves.toEqual({
        id: SCORE,
        deleted: true,
      });
      expect(trx.softDelete).toHaveBeenCalled();
    });
  });

  describe('fills', () => {
    it('listFills filters by all known query keys (string values only)', async () => {
      const { service, trx } = makeService([[]]);
      await service.listFills({
        formId: 'f',
        scopeId: 's',
        runId: 'r',
        taskId: 't',
        targetId: 'tid',
        targetType: 'ttype',
        nonsense: 'x',
        empty: '',
      });
      const params = trx.query.mock.calls[0]?.[1] as unknown[];
      expect(params).toEqual(['f', 's', 'r', 't', 'tid', 'ttype']);
    });

    it('listFormFills filters by form_id and orders by created_at desc', async () => {
      const { service, trx } = makeService([[]]);
      await service.listFormFills(FORM);
      const [sql, params] = trx.query.mock.calls[0]!;
      expect(sql).toContain('form_id = $1::uuid');
      expect(sql).toContain('order by created_at desc');
      expect(params).toEqual([FORM]);
    });

    it('getFormFill returns row matched by form + fill ids', async () => {
      const { service } = makeService([[{ id: FILL, form_id: FORM }]]);
      const result = await service.getFormFill(FORM, FILL);
      expect(result).toMatchObject({ id: FILL });
    });

    it('createFillFromBody requires formId in the body', () => {
      const { service } = makeService([]);
      // stringField throws synchronously before the createFill Promise is constructed.
      expect(() => service.createFillFromBody({})).toThrow(BadRequestException);
    });

    it('createFillFromBody routes to createFill when formId is present', async () => {
      const { service, trx } = makeService([[{ id: FILL, form_id: FORM }]]);
      const result = await service.createFillFromBody({
        formId: FORM,
        scopeId: SCOPE,
        targetType: 'doc',
        targetId: 'doc-1',
      });
      expect(result.id).toBe(FILL);
      const [sql] = trx.query.mock.calls[0]!;
      expect(sql).toContain('insert into flow.fills');
    });

    it('get, update, and delete fill methods route through shared helpers', async () => {
      const get = makeService([[{ id: FILL }]]);
      await expect(get.service.getFill(FILL)).resolves.toMatchObject({ id: FILL });

      const update = makeService([[{ id: FILL, status: 'submitted' }]]);
      await expect(update.service.updateFill(FILL, { status: 'submitted' })).resolves.toMatchObject({
        id: FILL,
        status: 'submitted',
      });

      const del = makeService([[{ exists: true }]]);
      await expect(del.service.deleteFill(FILL)).resolves.toEqual({ id: FILL, deleted: true });
      expect(del.trx.softDelete).toHaveBeenCalled();
    });
  });

  describe('answers', () => {
    it('upsertAnswer asserts fill + question, then upserts via TX', async () => {
      const { service, trx } = makeService([
        [{ exists: true }],
        [{ exists: true }],
        [{ id: ANSWER, fill_id: FILL, question_id: QUESTION, value: { x: 1 } }],
      ]);
      const result = await service.upsertAnswer(FILL, { questionId: QUESTION, value: { x: 1 } });
      expect(result).toMatchObject({ id: ANSWER, questionId: QUESTION });
      const [upsertSql] = trx.query.mock.calls[2]!;
      expect(upsertSql).toContain('insert into flow.answers');
    });

    it('upsertAnswer rejects when fill does not exist', async () => {
      const { service } = makeService([[{ exists: false }]]);
      await expect(
        service.upsertAnswer(FILL, { questionId: QUESTION }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('upsertAnswer maps itemId → questionId via normalizeAnswerInput', async () => {
      const { service, trx } = makeService([
        [{ exists: true }],
        [{ exists: true }],
        [{ id: ANSWER }],
      ]);
      await service.upsertAnswer(FILL, { itemId: QUESTION, value: 'v' });
      // Order: tenant, fill, questionId, value, attachment, actor
      const params = trx.query.mock.calls[2]?.[1] as unknown[];
      expect(params[2]).toBe(QUESTION);
    });

    it('upsertAnswer defaults nullable answer fields and actor', async () => {
      const { service, trx } = makeService([
        [{ exists: true }],
        [{ exists: true }],
        [],
      ], { tenantId: 't-1' });
      await expect(service.upsertAnswer(FILL, { questionId: QUESTION })).resolves.toEqual({});
      expect(trx.query.mock.calls[2]?.[1]).toEqual([
        't-1',
        FILL,
        QUESTION,
        null,
        null,
        null,
      ]);
    });

    it('bulkUpsertAnswers iterates and upserts each, asserting question existence per row', async () => {
      const Q2 = '0190abcd-1234-7abc-89ab-000000000099';
      const { service } = makeService([
        [{ exists: true }],
        [{ exists: true }],
        [{ id: ANSWER }],
        [{ exists: true }],
        [{ id: ANSWER }],
      ]);
      const result = await service.bulkUpsertAnswers(FILL, {
        answers: [
          { questionId: QUESTION, value: 1 },
          { questionId: Q2, value: 2 },
        ],
      });
      expect(result).toHaveLength(2);
    });

    it('bulkUpsertAnswers accepts a bare array as input', async () => {
      const { service } = makeService([
        [{ exists: true }],
        [{ exists: true }],
        [{ id: ANSWER }],
      ]);
      const result = await service.bulkUpsertAnswers(FILL, [
        { questionId: QUESTION, value: 1 },
      ]);
      expect(result).toHaveLength(1);
    });

    it('bulkUpsertAnswers uses a nullable actor when the context has none', async () => {
      const { service, trx } = makeService([
        [{ exists: true }],
        [{ exists: true }],
        [{ id: ANSWER }],
      ], { tenantId: 't-1' });
      await service.bulkUpsertAnswers(FILL, [{ questionId: QUESTION, value: 1 }]);
      expect((trx.query.mock.calls[2]?.[1] as unknown[])[5]).toBeNull();
    });

    it('updateAnswer asserts question when questionId is set', async () => {
      const { service, trx } = makeService([
        [{ exists: true }],
        [{ id: ANSWER, value: 'x' }],
      ]);
      const result = await service.updateAnswer(ANSWER, { questionId: QUESTION, value: 'x' });
      expect(result).toMatchObject({ id: ANSWER });
      expect(trx.query.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('updateAnswer with no questionId skips the assertExists', async () => {
      const { service, trx } = makeService([
        [{ id: ANSWER, value: 'x' }],
      ]);
      await service.updateAnswer(ANSWER, { value: 'x' });
      expect(trx.query.mock.calls.length).toBe(1);
      expect(trx.query.mock.calls[0]?.[0]).not.toContain('question_id');
    });

    it('updateAnswer records a nullable actor when the context has none', async () => {
      const { service, trx } = makeService([
        [{ id: ANSWER, value: 'x' }],
      ], { tenantId: 't-1' });
      await service.updateAnswer(ANSWER, { value: 'x' });
      expect((trx.query.mock.calls[0]?.[1] as unknown[])[2]).toBeNull();
    });

    it('listFormFillAnswers verifies fill belongs to form, then lists answers', async () => {
      const { service, trx } = makeService([
        [{ id: FILL, form_id: FORM }],
        [{ id: ANSWER }],
      ]);
      const result = await service.listFormFillAnswers(FORM, FILL);
      expect(result).toHaveLength(1);
      expect(trx.query.mock.calls.length).toBe(2);
    });

    it('deleteAnswer soft deletes after existence check', async () => {
      const { service, trx } = makeService([[{ exists: true }]]);
      await expect(service.deleteAnswer(ANSWER)).resolves.toEqual({ id: ANSWER, deleted: true });
      expect(trx.softDelete).toHaveBeenCalled();
    });
  });

  describe('waivers', () => {
    it('listWaivers filters by allowed keys', async () => {
      const { service, trx } = makeService([[]]);
      await service.listWaivers({ scopeId: 's', formId: 'f' });
      const params = trx.query.mock.calls[0]?.[1] as unknown[];
      expect(params).toEqual(['s', 'f']);
    });

    it('createWaiver inserts a row', async () => {
      const { service, trx } = makeService([[{ id: WAIVER }]]);
      const result = await service.createWaiver({
        scopeId: SCOPE,
        targetType: 'doc',
        targetId: 't',
        formId: FORM,
        reason: 'because',
      });
      expect(result.id).toBe(WAIVER);
      const [sql] = trx.query.mock.calls[0]!;
      expect(sql).toContain('insert into flow.waivers');
    });

    it('createFillWaiver hydrates context from the parent fill', async () => {
      const { service, trx } = makeService([
        [{
          id: FILL,
          scope_id: SCOPE,
          target_type: 'doc',
          target_id: 't-1',
          form_id: FORM,
        }],
        [{ id: WAIVER }],
      ]);
      const result = await service.createFillWaiver(FILL, { reason: 'because' });
      expect(result.id).toBe(WAIVER);
      const params = trx.query.mock.calls[1]?.[1] as unknown[];
      expect(params).toContain(SCOPE);
      expect(params).toContain(FORM);
    });

    it('createFillWaiver rejects when the parent fill lacks required fields', async () => {
      const { service } = makeService([
        [{ id: FILL, scope_id: null }],
      ]);
      await expect(service.createFillWaiver(FILL, { reason: 'b' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('update and delete waiver methods route through shared helpers', async () => {
      const update = makeService([[{ id: WAIVER, reason: 'updated' }]]);
      await expect(update.service.updateWaiver(WAIVER, { reason: 'updated' })).resolves.toMatchObject({
        id: WAIVER,
        reason: 'updated',
      });

      const del = makeService([[{ exists: true }]]);
      await expect(del.service.deleteWaiver(WAIVER)).resolves.toEqual({
        id: WAIVER,
        deleted: true,
      });
      expect(del.trx.softDelete).toHaveBeenCalled();
    });

    it('lists fill waivers and form-fill waivers from hydrated fill context', async () => {
      const fillWaivers = makeService([
        [{
          id: FILL,
          scope_id: SCOPE,
          target_type: 'doc',
          target_id: 't-1',
          form_id: FORM,
        }],
        [{ id: WAIVER }],
      ]);
      await expect(fillWaivers.service.listFillWaivers(FILL)).resolves.toHaveLength(1);
      expect(fillWaivers.trx.query.mock.calls[1]?.[1]).toEqual([SCOPE, FORM, 't-1', 'doc']);

      const formFillWaivers = makeService([
        [{
          id: FILL,
          scope_id: SCOPE,
          target_type: 'doc',
          target_id: 't-1',
          form_id: FORM,
        }],
        [{ id: WAIVER }],
      ]);
      await expect(formFillWaivers.service.listFormFillWaivers(FORM, FILL)).resolves.toHaveLength(1);
      expect(formFillWaivers.trx.query.mock.calls[1]?.[1]).toEqual([SCOPE, FORM, 't-1', 'doc']);
    });

    it('creates form-fill waivers after verifying fill ownership', async () => {
      const { service, trx } = makeService([
        [{ id: FILL, form_id: FORM }],
        [{
          id: FILL,
          scope_id: SCOPE,
          target_type: 'doc',
          target_id: 't-1',
          form_id: FORM,
        }],
        [{ id: WAIVER }],
      ]);
      await expect(service.createFormFillWaiver(FORM, FILL, { reason: 'approved' })).resolves.toMatchObject({
        id: WAIVER,
      });
      expect(trx.query.mock.calls).toHaveLength(3);
    });
  });

  describe('tenant requirement', () => {
    it('requireTenantId throws when no tenant is in request context', async () => {
      const { service } = makeService([], { actorId: 'u-1' });
      await expect(
        service.createFill(FORM, {
          scopeId: SCOPE,
          targetType: 'doc',
          targetId: 't',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('input validation', () => {
    it('createQuestion rejects an array as input body', () => {
      const { service } = makeService([]);
      expect(() => service.createQuestion(FORM, [])).toThrow(BadRequestException);
    });

    it('createForm accepts missing actor and empty insert result', async () => {
      const { service, trx } = makeService([[]], { tenantId: 't-1' });
      await expect(service.createForm({
        scopeId: SCOPE,
        code: 'C',
        title: 'T',
      })).resolves.toEqual({});
      expect((trx.query.mock.calls[0]?.[1] as unknown[]).slice(-2)).toEqual([null, null]);
    });

    it('upsertAnswer rejects when the body is not an object', () => {
      const { service } = makeService([]);
      expect(() => service.upsertAnswer(FILL, 'not-an-object')).toThrow(BadRequestException);
    });
  });
});
