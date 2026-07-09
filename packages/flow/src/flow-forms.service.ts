import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database, Transaction } from '@stynx-nyx/data';
import { FORM_TABLES, formEntries, type FormTableKey } from './internal/forms/form-tables';
import { camelizeRow, type FlowRow } from './row-utils';
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
} from './validation';

@Injectable()
export class FlowFormsService {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
  ) {}

  listForms(scopeId?: string): Promise<Record<string, unknown>[]> {
    return this.listRows('forms', scopeId ? { scope_id: scopeId } : {}, 'code, version');
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
    return this.listRows('questions', { form_id: formId }, 'sort_order, key');
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
    return this.getOne(
      'select * from flow.scores where question_id = $1::uuid limit 1',
      [questionId],
      'Question score not found',
    );
  }

  putQuestionScore(questionId: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(putScoreSchema, input);
    return this.db.tx(async (trx) => {
      await this.assertExists(trx, 'flow.questions', questionId, 'Question not found');
      const tenantId = this.requireTenantId();
      const actorId = this.requestContext.actorId ?? null;
      const result = await trx.query<FlowRow>(
        `
          insert into flow.scores (
            tenant_id,
            question_id,
            pass_points,
            fail_points,
            meta,
            created_by,
            updated_by
          )
          values ($1::uuid, $2::uuid, $3::numeric, $4::numeric, $5::jsonb, $6::uuid, $6::uuid)
          on conflict (tenant_id, question_id) do update
          set pass_points = excluded.pass_points,
              fail_points = excluded.fail_points,
              meta = excluded.meta,
              updated_by = excluded.updated_by,
              updated_at = clock_timestamp()
          returning *
        `,
        [
          tenantId,
          questionId,
          dto.passPoints ?? '1',
          dto.failPoints ?? '0',
          dto.meta ?? {},
          actorId,
        ],
      );
      return camelizeRow(result.rows[0] ?? {});
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
    return this.listRows('fills', filters, 'created_at desc');
  }

  listFormFills(formId: string): Promise<Record<string, unknown>[]> {
    return this.listRows('fills', { form_id: formId }, 'created_at desc');
  }

  getFill(id: string): Promise<Record<string, unknown>> {
    return this.getRow('fills', id);
  }

  getFormFill(formId: string, fillId: string): Promise<Record<string, unknown>> {
    return this.getOne(
      'select * from flow.fills where form_id = $1::uuid and id = $2::uuid limit 1',
      [formId, fillId],
      'Fill not found',
    );
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
    return this.listRows('answers', { fill_id: fillId }, 'created_at, id');
  }

  async listFormFillAnswers(formId: string, fillId: string): Promise<Record<string, unknown>[]> {
    await this.getFormFill(formId, fillId);
    return this.listAnswers(fillId);
  }

  upsertAnswer(fillId: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(answerWriteSchema, this.normalizeAnswerInput(input));
    return this.db.tx(async (trx) => {
      await this.assertExists(trx, 'flow.fills', fillId, 'Fill not found');
      await this.assertExists(trx, 'flow.questions', dto.questionId!, 'Question not found');
      const tenantId = this.requireTenantId();
      const actorId = this.requestContext.actorId ?? null;
      return this.upsertAnswerInTx(trx, tenantId, actorId, fillId, dto);
    });
  }

  bulkUpsertAnswers(fillId: string, input: unknown): Promise<Record<string, unknown>[]> {
    const parsed = parseDto(bulkAnswerWriteSchema, input);
    const answers = Array.isArray(parsed) ? parsed : parsed.answers;
    return this.db.tx(async (trx) => {
      await this.assertExists(trx, 'flow.fills', fillId, 'Fill not found');
      const tenantId = this.requireTenantId();
      const actorId = this.requestContext.actorId ?? null;
      const rows: Record<string, unknown>[] = [];
      for (const answer of answers) {
        const dto = parseDto(answerWriteSchema, this.normalizeAnswerInput(answer));
        await this.assertExists(trx, 'flow.questions', dto.questionId!, 'Question not found');
        rows.push(await this.upsertAnswerInTx(trx, tenantId, actorId, fillId, dto));
      }
      return rows;
    });
  }

  updateAnswer(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(updateAnswerSchema, this.normalizeAnswerInput(input));
    return this.db.tx(async (trx) => {
      if (dto.questionId) {
        await this.assertExists(trx, 'flow.questions', dto.questionId, 'Question not found');
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
    return this.listRows('waivers', filters, 'created_at desc');
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
    const result = await trx.query<FlowRow>(
      `
        insert into flow.answers (
          tenant_id,
          fill_id,
          question_id,
          value,
          attachment,
          created_by,
          updated_by
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5::jsonb, $6::uuid, $6::uuid)
        on conflict (tenant_id, fill_id, question_id) do update
        set value = excluded.value,
            attachment = excluded.attachment,
            updated_by = excluded.updated_by,
            updated_at = clock_timestamp()
        returning *
      `,
      [tenantId, fillId, dto.questionId, dto.value ?? null, dto.attachment ?? null, actorId],
    );
    return camelizeRow(result.rows[0] ?? {});
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

  private async createRow(key: FormTableKey, input: Record<string, unknown>): Promise<Record<string, unknown>> {
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
      const result = await trx.query<FlowRow>(
        `insert into ${config.sqlName} (${rowEntries.map(([column]) => column).join(', ')}) values (${rowEntries.map((_entry, index) => `$${index + 1}`).join(', ')}) returning *`,
        rowEntries.map(([, value]) => value),
      );
      return camelizeRow(result.rows[0] ?? {});
    });
  }

  private async updateRow(key: FormTableKey, id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      return this.updateRowInTx(trx, key, id, input);
    });
  }

  private async updateRowInTx(
    trx: Transaction,
    key: FormTableKey,
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
    const result = await trx.query<FlowRow>(
      `update ${config.sqlName} set ${rowEntries.map(([column], index) => `${column} = $${index + 2}`).join(', ')} where id = $1::uuid returning *`,
      [id, ...rowEntries.map(([, value]) => value)],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Flow row not found');
    }
    return camelizeRow(row);
  }

  private async softDeleteRow(key: FormTableKey, id: string): Promise<Record<string, unknown>> {
    const config = FORM_TABLES[key];
    return this.db.tx(async (trx) => {
      await this.assertExists(trx, config.sqlName, id, 'Flow row not found');
      await trx.softDelete(config.softDeleteTable as never, id);
      return { id, deleted: true };
    });
  }

  private listRows(
    key: FormTableKey,
    filters: Record<string, string> = {},
    orderBy = 'created_at desc',
  ): Promise<Record<string, unknown>[]> {
    const config = FORM_TABLES[key];
    return this.db.tx(async (trx) => {
      const values = Object.values(filters);
      const uuidColumns = new Set([
        'fill_id',
        'form_id',
        'node_run_id',
        'question_id',
        'run_id',
        'scope_id',
        'task_id',
      ]);
      const where = Object.keys(filters)
        .map((column, index) => `${column} = $${index + 1}${uuidColumns.has(column) ? '::uuid' : ''}`)
        .join(' and ');
      const result = await trx.query<FlowRow>(
        `select * from ${config.sqlName}${where ? ` where ${where}` : ''} order by ${orderBy}`,
        values,
      );
      return result.rows.map(camelizeRow);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  private getRow(key: FormTableKey, id: string): Promise<Record<string, unknown>> {
    return this.getOne(`select * from ${FORM_TABLES[key].sqlName} where id = $1::uuid limit 1`, [id], 'Flow row not found');
  }

  private async getOne(sql: string, values: unknown[], message: string): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(sql, values);
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException(message);
      }
      return camelizeRow(row);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  private async assertExists(trx: Transaction, table: string, id: string, message: string): Promise<void> {
    const result = await trx.query<{ exists: boolean }>(
      `select exists(select 1 from ${table} where id = $1::uuid) as exists`,
      [id],
    );
    if (!result.rows[0]?.exists) {
      throw new NotFoundException(message);
    }
  }

  private objectInput(input: unknown): Record<string, unknown> {
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
      return input as Record<string, unknown>;
    }
    throw new BadRequestException('Request body must be an object');
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
