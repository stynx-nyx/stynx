import { executeFormsCreate, executeFormsUpdate } from './forms-mutations.repository.js';
import { executeQuestionsCreate, executeQuestionsUpdate } from './questions-mutations.repository.js';
import { executeWaiversCreate, executeWaiversUpdate } from './waivers-mutations.repository.js';
import { executeFillsCreate, executeFillsUpdate, executeAnswersUpdate } from './forms-small-mutations.repository.js';
import { executeFormsList, type FormsListKey } from './forms-list.repository.js';
import { executeFormsFixedRead, executeFormsExists, type FormsFixedRead } from './forms-read.repository.js';
import { putQuestionScoreQuery, upsertAnswerQuery, isFormsWriteRow } from './forms-write.repository.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database, Transaction } from '@stynx-nyx/data';
import { FORM_TABLES, formEntries, type FormTableKey } from './internal/forms/form-tables.js';
import { camelizeRow, requireObject } from './row-utils.js';
import {
  answerWriteSchema,
  bulkAnswerWriteSchema,
  createFillSchema,
  createFormSchema,
  createQuestionSchema,
  createWaiverSchema,
  parseDto,
  putScoreSchema,
  updateAnswerSchema,
  updateFillSchema,
  updateFormSchema,
  updateQuestionSchema,
  updateWaiverSchema,
} from './validation.js';

function remainingFormsMutationMask(
  key: 'forms' | 'questions' | 'waivers',
  entries: ReadonlyArray<ReadonlyArray<unknown>>,
): number {
  const columns: readonly string[] = Object.values(FORM_TABLES[key].columns);
  let mask = 0;
  for (const [column] of entries) {
    const index = columns.findIndex((candidate) => candidate === column);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

function formMutationMask(key: 'fills' | 'answers', entries: ReadonlyArray<ReadonlyArray<unknown>>): number {
  const columns: readonly string[] = Object.values(FORM_TABLES[key].columns);
  let mask = 0;
  for (const [column] of entries) {
    const index = columns.findIndex((candidate) => candidate === column);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

@Injectable()
export class FlowFormsService {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
  ) {}

  listForms(scopeId?: string): Promise<Record<string, unknown>[]> {
    return this.listRows('forms', scopeId ? { scope_id: scopeId } : {});
  }

  getForm(id: string): Promise<Record<string, unknown>> {
    return this.getRow('forms', id);
  }

  createForm(input: unknown): Promise<Record<string, unknown>> {
    return this.createRow('forms', parseDto(createFormSchema, input));
  }

  updateForm(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.updateRow('forms', id, parseDto(updateFormSchema, input));
  }

  deleteForm(id: string): Promise<Record<string, unknown>> {
    return this.softDeleteRow('forms', id);
  }

  listQuestions(formId: string): Promise<Record<string, unknown>[]> {
    return this.listRows('questions', { form_id: formId });
  }

  getQuestion(id: string): Promise<Record<string, unknown>> {
    return this.getRow('questions', id);
  }

  createQuestion(formId: string, input: unknown): Promise<Record<string, unknown>> {
    return this.createRow('questions', parseDto(createQuestionSchema, { ...this.objectInput(input), formId }));
  }

  updateQuestion(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.updateRow('questions', id, parseDto(updateQuestionSchema, input));
  }

  deleteQuestion(id: string): Promise<Record<string, unknown>> {
    return this.softDeleteRow('questions', id);
  }

  getQuestionScore(questionId: string): Promise<Record<string, unknown>> {
    return this.getOne('scores', questionId, 'Question score not found');
  }

  putQuestionScore(questionId: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(putScoreSchema, input);
    return this.db.tx(async (trx) => {
      await this.assertExists(trx, 'questions', questionId, 'Question not found');
      const tenantId = this.requireTenantId();
      const actorId = this.requestContext.actorId ?? null;
      const result = await trx.runGuarded(putQuestionScoreQuery,
        [
          tenantId,
          questionId,
          dto.passPoints ?? '1',
          dto.failPoints ?? '0',
          dto.meta ?? {},
          actorId,
        ],
        isFormsWriteRow,
      );
      return camelizeRow(result[0] ?? {});
    });
  }

  async deleteQuestionScore(questionId: string): Promise<Record<string, unknown>> {
    const score = await this.getQuestionScore(questionId);
    return this.softDeleteRow('scores', String(score.id));
  }

  listFills(query: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    const filters: Record<string, string> = {};
    for (const [apiName, columnName] of Object.entries({
      formId: 'form_id',
      scopeId: 'scope_id',
      runId: 'run_id',
      taskId: 'task_id',
      targetId: 'target_id',
      targetType: 'target_type',
    })) {
      const value = query[apiName];
      if (typeof value === 'string' && value.length > 0) {
        filters[columnName] = value;
      }
    }
    return this.listRows('fills', filters);
  }

  listFormFills(formId: string): Promise<Record<string, unknown>[]> {
    return this.listRows('fills', { form_id: formId });
  }

  getFill(id: string): Promise<Record<string, unknown>> {
    return this.getRow('fills', id);
  }

  getFormFill(formId: string, fillId: string): Promise<Record<string, unknown>> {
    return this.getOne('formFill', formId, 'Fill not found', fillId);
  }

  createFill(formId: string, input: unknown): Promise<Record<string, unknown>> {
    return this.createRow('fills', parseDto(createFillSchema, { ...this.objectInput(input), formId }));
  }

  createFillFromBody(input: unknown): Promise<Record<string, unknown>> {
    const body = this.objectInput(input);
    const formId = this.stringField(body, 'formId', 'formId is required');
    return this.createFill(formId, body);
  }

  updateFill(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.updateRow('fills', id, parseDto(updateFillSchema, input));
  }

  deleteFill(id: string): Promise<Record<string, unknown>> {
    return this.softDeleteRow('fills', id);
  }

  listAnswers(fillId: string): Promise<Record<string, unknown>[]> {
    return this.listRows('answers', { fill_id: fillId });
  }

  async listFormFillAnswers(formId: string, fillId: string): Promise<Record<string, unknown>[]> {
    await this.getFormFill(formId, fillId);
    return this.listAnswers(fillId);
  }

  upsertAnswer(fillId: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(answerWriteSchema, this.normalizeAnswerInput(input));
    return this.db.tx(async (trx) => {
      await this.assertExists(trx, 'fills', fillId, 'Fill not found');
      await this.assertExists(trx, 'questions', dto.questionId!, 'Question not found');
      const tenantId = this.requireTenantId();
      const actorId = this.requestContext.actorId ?? null;
      return this.upsertAnswerInTx(trx, tenantId, actorId, fillId, dto);
    });
  }

  bulkUpsertAnswers(fillId: string, input: unknown): Promise<Record<string, unknown>[]> {
    const parsed = parseDto(bulkAnswerWriteSchema, input);
    const answers = Array.isArray(parsed) ? parsed : parsed.answers;
    return this.db.tx(async (trx) => {
      await this.assertExists(trx, 'fills', fillId, 'Fill not found');
      const tenantId = this.requireTenantId();
      const actorId = this.requestContext.actorId ?? null;
      const rows: Record<string, unknown>[] = [];
      for (const answer of answers) {
        const dto = parseDto(answerWriteSchema, this.normalizeAnswerInput(answer));
        await this.assertExists(trx, 'questions', dto.questionId!, 'Question not found');
        rows.push(await this.upsertAnswerInTx(trx, tenantId, actorId, fillId, dto));
      }
      return rows;
    });
  }

  updateAnswer(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(updateAnswerSchema, this.normalizeAnswerInput(input));
    return this.db.tx(async (trx) => {
      if (dto.questionId) {
        await this.assertExists(trx, 'questions', dto.questionId, 'Question not found');
      }
      return this.updateRowInTx(trx, 'answers', id, dto);
    });
  }

  deleteAnswer(id: string): Promise<Record<string, unknown>> {
    return this.softDeleteRow('answers', id);
  }

  listWaivers(query: Record<string, unknown> = {}): Promise<Record<string, unknown>[]> {
    const filters: Record<string, string> = {};
    for (const [apiName, columnName] of Object.entries({
      scopeId: 'scope_id',
      formId: 'form_id',
      questionId: 'question_id',
      targetId: 'target_id',
      targetType: 'target_type',
    })) {
      const value = query[apiName];
      if (typeof value === 'string' && value.length > 0) {
        filters[columnName] = value;
      }
    }
    return this.listRows('waivers', filters);
  }

  createWaiver(input: unknown): Promise<Record<string, unknown>> {
    return this.createRow('waivers', parseDto(createWaiverSchema, input));
  }

  updateWaiver(id: string, input: unknown): Promise<Record<string, unknown>> {
    return this.updateRow('waivers', id, parseDto(updateWaiverSchema, input));
  }

  deleteWaiver(id: string): Promise<Record<string, unknown>> {
    return this.softDeleteRow('waivers', id);
  }

  async createFillWaiver(fillId: string, input: unknown): Promise<Record<string, unknown>> {
    const fill = await this.getFill(fillId);
    return this.createWaiver({
      ...this.objectInput(input),
      scopeId: this.stringField(fill, 'scopeId', 'Fill scope is required'),
      targetType: this.stringField(fill, 'targetType', 'Fill target type is required'),
      targetId: this.stringField(fill, 'targetId', 'Fill target id is required'),
      formId: this.stringField(fill, 'formId', 'Fill form is required'),
    });
  }

  async listFillWaivers(fillId: string): Promise<Record<string, unknown>[]> {
    const fill = await this.getFill(fillId);
    return this.listWaivers({
      scopeId: this.stringField(fill, 'scopeId', 'Fill scope is required'),
      formId: this.stringField(fill, 'formId', 'Fill form is required'),
      targetType: this.stringField(fill, 'targetType', 'Fill target type is required'),
      targetId: this.stringField(fill, 'targetId', 'Fill target id is required'),
    });
  }

  async listFormFillWaivers(formId: string, fillId: string): Promise<Record<string, unknown>[]> {
    const fill = await this.getFormFill(formId, fillId);
    return this.listWaivers({
      scopeId: this.stringField(fill, 'scopeId', 'Fill scope is required'),
      formId,
      targetType: this.stringField(fill, 'targetType', 'Fill target type is required'),
      targetId: this.stringField(fill, 'targetId', 'Fill target id is required'),
    });
  }

  async createFormFillWaiver(formId: string, fillId: string, input: unknown): Promise<Record<string, unknown>> {
    await this.getFormFill(formId, fillId);
    return this.createFillWaiver(fillId, input);
  }

  private async upsertAnswerInTx(
    trx: Transaction,
    tenantId: string,
    actorId: string | null,
    fillId: string,
    dto: { questionId?: string | undefined; value?: unknown; attachment?: unknown },
  ): Promise<Record<string, unknown>> {
    const result = await trx.runGuarded(upsertAnswerQuery,
      [tenantId, fillId, dto.questionId, dto.value ?? null, dto.attachment ?? null, actorId],
      isFormsWriteRow,
    );
    return camelizeRow(result[0] ?? {});
  }

  private normalizeAnswerInput(input: unknown): Record<string, unknown> {
    const body = this.objectInput(input);
    const normalized = { ...body };
    const questionId = body.questionId ?? body.itemId;
    if (questionId === undefined) {
      delete normalized.questionId;
    } else {
      normalized.questionId = questionId;
    }
    return normalized;
  }

  private async createRow(key: 'forms' | 'questions' | 'fills' | 'waivers', input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const config = FORM_TABLES[key];
    return this.db.tx(async (trx) => {
      const tenantId = this.requireTenantId();
      const actorId = this.requestContext.actorId ?? null;
      const rowEntries = [
        ['tenant_id', tenantId],
        ...formEntries(input, config.columns),
      ];
      if (config.actorColumns) {
        rowEntries.push(['created_by', actorId]);
        rowEntries.push(['updated_by', actorId]);
      }
      const values = rowEntries.map(([, value]) => value);
      const rows = key === 'forms'
        ? await executeFormsCreate(trx, remainingFormsMutationMask(key, rowEntries), values)
        : key === 'questions'
        ? await executeQuestionsCreate(trx, remainingFormsMutationMask(key, rowEntries), values)
        : key === 'waivers'
        ? await executeWaiversCreate(trx, remainingFormsMutationMask(key, rowEntries), values)
        : await executeFillsCreate(trx, formMutationMask(key, rowEntries), values);
      return camelizeRow(rows[0] ?? {});
    });
  }

  private async updateRow(key: 'forms' | 'questions' | 'fills' | 'answers' | 'waivers', id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      return this.updateRowInTx(trx, key, id, input);
    });
  }

  private async updateRowInTx(
    trx: Transaction,
    key: 'forms' | 'questions' | 'fills' | 'answers' | 'waivers',
    id: string,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const config = FORM_TABLES[key];
    const rowEntries = formEntries(input, config.columns);
    if (rowEntries.length === 0) {
      throw new BadRequestException('At least one update field is required');
    }
    if (config.actorColumns) {
      rowEntries.push(['updated_by', this.requestContext.actorId ?? null]);
    }
    rowEntries.push(['updated_at', new Date()]);
    const values = [id, ...rowEntries.map(([, value]) => value)];
    const rows = key === 'forms'
      ? await executeFormsUpdate(trx, remainingFormsMutationMask(key, rowEntries), values)
      : key === 'questions'
      ? await executeQuestionsUpdate(trx, remainingFormsMutationMask(key, rowEntries), values)
      : key === 'waivers'
      ? await executeWaiversUpdate(trx, remainingFormsMutationMask(key, rowEntries), values)
      : key === 'fills'
      ? await executeFillsUpdate(trx, formMutationMask(key, rowEntries), values)
      : await executeAnswersUpdate(trx, formMutationMask(key, rowEntries), values);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Flow row not found');
    }
    return camelizeRow(row);
  }

  private async softDeleteRow(key: FormTableKey, id: string): Promise<Record<string, unknown>> {
    const config = FORM_TABLES[key];
    return this.db.tx(async (trx) => {
      await this.assertExists(trx, key, id, 'Flow row not found');
      await trx.softDelete(config.softDeleteTable, id);
      return { id, deleted: true };
    });
  }

  private listRows(key: FormsListKey, filters: Record<string, string> = {}): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const rows = await executeFormsList(trx, key, filters);
      return rows.map(camelizeRow);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  private getRow(key: 'forms' | 'questions' | 'fills', id: string): Promise<Record<string, unknown>> {
    return this.getOne(key, id, 'Flow row not found');
  }

  private async getOne(key: FormsFixedRead, id: string, message: string, secondId?: string): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      const rows = await executeFormsFixedRead(trx, key, id, secondId);
      const row = rows[0];
      if (!row) {
        throw new NotFoundException(message);
      }
      return camelizeRow(row);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  private async assertExists(trx: Transaction, key: FormTableKey, id: string, message: string): Promise<void> {
    const rows = await executeFormsExists(trx, key, id);
    if (!rows[0]?.exists) {
      throw new NotFoundException(message);
    }
  }

  private objectInput(input: unknown): Record<string, unknown> {
    return requireObject(input);
  }

  private stringField(row: Record<string, unknown>, key: string, message: string): string {
    const value = row[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new BadRequestException(message);
    }
    return value;
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }
}
