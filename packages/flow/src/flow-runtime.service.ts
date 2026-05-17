import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database, Transaction } from '@stynx/data';
import { FlowAdapterRegistry } from './adapters';
import { camelizeRow, pageLimitOffset, requireObject, type FlowRow } from './row-utils';
import {
  assignTaskSchema,
  ensureRunSchema,
  parseDto,
  signalSchema,
  taskActionSchema,
  taskNoteSchema,
  updateRunSchema,
} from './validation';

type FilterInput = Record<string, unknown>;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function addUuidFilter(
  where: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  const stringValue = optionalString(value);
  if (!stringValue) {
    return;
  }
  values.push(stringValue);
  where.push(`${column} = $${values.length}::uuid`);
}

function addTextFilter(
  where: string[],
  values: unknown[],
  column: string,
  value: unknown,
): void {
  const stringValue = optionalString(value);
  if (!stringValue) {
    return;
  }
  values.push(stringValue);
  where.push(`${column} = $${values.length}`);
}

@Injectable()
export class FlowRuntimeService {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
    private readonly adapters: FlowAdapterRegistry,
  ) {}

  async ensureRun(input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(ensureRunSchema, input);
    const scopeCode = dto.scopeCode ?? await this.scopeCodeForId(dto.scopeId);

    await this.buildAdapterFactsIfRegistered({
      adapterKey: dto.adapterKey,
      targetType: dto.targetType,
      targetId: dto.targetId,
      signalKey: dto.signalKey,
      payload: dto.payload,
    });

    return this.db.tx(async (trx) => {
      const result = await trx.query<{ run_id: string }>(
        `
          select flow.run_ensure(
            $1::text,
            $2::text,
            $3::text,
            $4::text,
            $5::text,
            $6::text
          ) as run_id
        `,
        [dto.graphCode, dto.version, scopeCode, dto.adapterKey ?? null, dto.targetType, dto.targetId],
      );
      const runId = result.rows[0]?.run_id;
      if (!runId) {
        throw new BadRequestException('Flow run was not created');
      }
      return { runId };
    });
  }

  listRuns(query: FilterInput = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const where: string[] = [];
    const values: unknown[] = [];
    addUuidFilter(where, values, 'scope_id', query.scopeId);
    addUuidFilter(where, values, 'graph_id', query.graphId);
    addTextFilter(where, values, 'target_type', query.targetType);
    addTextFilter(where, values, 'target_id', query.targetId);
    addTextFilter(where, values, 'status', query.status);
    const whereSql = where.length > 0 ? ` where ${where.join(' and ')}` : '';

    return this.db.tx(async (trx) => {
      const rows = await trx.query<FlowRow>(
        `select * from flow.runs${whereSql} order by created_at desc limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      );
      const total = await trx.query<{ total: string }>(
        `select count(*)::text as total from flow.runs${whereSql}`,
        values,
      );
      return {
        data: rows.rows.map(camelizeRow),
        meta: {
          page,
          pageSize,
          total: Number(total.rows[0]?.total ?? 0),
        },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  getRun(id: string): Promise<Record<string, unknown>> {
    return this.getOne('select * from flow.runs where id = $1::uuid limit 1', [id], 'Run not found');
  }

  updateRun(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(updateRunSchema, input);
    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(
        `
          update flow.runs
          set status = $2::flow.run_status,
              updated_by = $3::uuid,
              updated_at = clock_timestamp()
          where id = $1::uuid
          returning *
        `,
        [id, dto.status, this.requestContext.actorId ?? null],
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException('Run not found');
      }
      return camelizeRow(row);
    });
  }

  listRunNodeRuns(runId: string): Promise<Record<string, unknown>[]> {
    return this.list(
      `
        select nr.*, n.code as node_code, n.name as node_name, n.kind
        from flow.node_runs nr
        join flow.nodes n on n.id = nr.node_id
        where nr.run_id = $1::uuid
        order by nr.opened_at, nr.id
      `,
      [runId],
    );
  }

  listRunTasks(runId: string): Promise<Record<string, unknown>[]> {
    return this.list(
      `
        select t.*, n.code as node_code, n.name as node_name, n.kind
        from flow.tasks t
        join flow.nodes n on n.id = t.node_id
        where t.run_id = $1::uuid
        order by t.created_at desc, t.id
      `,
      [runId],
    );
  }

  listRunEvents(runId: string): Promise<Record<string, unknown>[]> {
    return this.list(
      `
        select e.*, n.code as node_code, t.status as task_status
        from flow.events e
        left join flow.nodes n on n.id = e.node_id
        left join flow.tasks t on t.id = e.task_id
        where e.run_id = $1::uuid
        order by e.created_at desc, e.id desc
      `,
      [runId],
    );
  }

  async getRunFacts(id: string): Promise<Record<string, unknown>> {
    const run = await this.getRun(id);
    const adapterFacts = await this.buildAdapterFactsIfRegistered({
      adapterKey: optionalString(run.adapterKey),
      targetType: String(run.targetType),
      targetId: String(run.targetId),
      runId: id,
    });

    return this.db.tx(async (trx) => {
      const result = await trx.query<{ facts: Record<string, unknown> }>(
        'select flow.build_facts($1::uuid, $2::text, $3::text) as facts',
        [run.scopeId, run.targetType, run.targetId],
      );
      return {
        ...(result.rows[0]?.facts ?? {}),
        adapter: adapterFacts,
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  listNodeRuns(query: FilterInput = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const where: string[] = [];
    const values: unknown[] = [];
    addUuidFilter(where, values, 'nr.run_id', query.runId);
    addTextFilter(where, values, 'nr.status', query.status);
    const whereSql = where.length > 0 ? ` where ${where.join(' and ')}` : '';

    return this.db.tx(async (trx) => {
      const rows = await trx.query<FlowRow>(
        `
          select nr.*, n.code as node_code, n.name as node_name, n.kind
          from flow.node_runs nr
          join flow.nodes n on n.id = nr.node_id
          ${whereSql}
          order by nr.opened_at desc, nr.id desc
          limit $${values.length + 1} offset $${values.length + 2}
        `,
        [...values, limit, offset],
      );
      const total = await trx.query<{ total: string }>(
        `select count(*)::text as total from flow.node_runs nr${whereSql}`,
        values,
      );
      return {
        data: rows.rows.map(camelizeRow),
        meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  getNodeRun(id: string): Promise<Record<string, unknown>> {
    return this.getOne(
      `
        select nr.*, n.code as node_code, n.name as node_name, n.kind
        from flow.node_runs nr
        join flow.nodes n on n.id = nr.node_id
        where nr.id = $1::uuid
        limit 1
      `,
      [id],
      'Node run not found',
    );
  }

  listTasks(query: FilterInput = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const where: string[] = [];
    const values: unknown[] = [];
    addUuidFilter(where, values, 't.run_id', query.runId);
    addUuidFilter(where, values, 't.assignee_user_id', query.assigneeUserId);
    addTextFilter(where, values, 't.status', query.status);
    if (query.mine === 'true' || query.mine === true) {
      values.push(this.requestContext.actorId ?? '');
      where.push(`t.assignee_user_id = $${values.length}::uuid`);
    }
    const whereSql = where.length > 0 ? ` where ${where.join(' and ')}` : '';

    return this.db.tx(async (trx) => {
      const rows = await trx.query<FlowRow>(
        `
          select t.*, n.code as node_code, n.name as node_name, n.kind
          from flow.tasks t
          join flow.nodes n on n.id = t.node_id
          ${whereSql}
          order by t.created_at desc, t.id desc
          limit $${values.length + 1} offset $${values.length + 2}
        `,
        [...values, limit, offset],
      );
      const total = await trx.query<{ total: string }>(
        `select count(*)::text as total from flow.tasks t${whereSql}`,
        values,
      );
      return {
        data: rows.rows.map(camelizeRow),
        meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  getTask(id: string): Promise<Record<string, unknown>> {
    return this.getOne(
      `
        select t.*, n.code as node_code, n.name as node_name, n.kind
        from flow.tasks t
        join flow.nodes n on n.id = t.node_id
        where t.id = $1::uuid
        limit 1
      `,
      [id],
      'Task not found',
    );
  }

  async actTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskActionSchema, input);
    await this.assertAllowedAction(id, dto.action);
    return this.callTaskFunction('flow.task_complete($1::uuid, $2::text, $3::text, $4::jsonb)', [
      id,
      dto.action,
      dto.note ?? null,
      dto.payload ?? {},
    ]);
  }

  assignTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(assignTaskSchema, input);
    return this.callTaskFunction('flow.task_assign($1::uuid, $2::uuid, $3::text)', [
      id,
      dto.userId,
      dto.note ?? null,
    ]);
  }

  unassignTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    return this.callTaskFunction('flow.task_unassign($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  acceptTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    return this.callTaskFunction('flow.task_accept($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  declineTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    return this.callTaskFunction('flow.task_decline($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  unacceptTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    return this.callTaskFunction('flow.task_unaccept($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  withdrawTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    return this.callTaskFunction('flow.task_withdraw($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  taskCandidates(id: string): Promise<Record<string, unknown>[]> {
    return this.list(
      `
        select candidate.*
        from flow.tasks t
        cross join lateral flow.resolve_agents(t.node_id, t.run_id) candidate
        where t.id = $1::uuid
      `,
      [id],
    );
  }

  listUsersForRole(role: string, search?: string): Promise<Record<string, unknown>[]> {
    const values: unknown[] = [role];
    const searchSql = optionalString(search)
      ? ` and (u.email::text ilike $2 or u.external_subject ilike $2)`
      : '';
    if (searchSql) {
      values.push(`%${search}%`);
    }

    return this.list(
      `
        select distinct u.id, u.email, u.external_subject
        from auth.users u
        join auth.memberships m on m.user_id = u.id and m.is_active
        join auth.membership_roles mr on mr.membership_id = m.id
        join auth.roles r on r.id = mr.role_id
        where r.key = $1
        ${searchSql}
        order by u.email
        limit 50
      `,
      values,
    );
  }

  getTaskUser(id: string): Promise<Record<string, unknown>> {
    return this.getOne(
      `
        select distinct u.id, u.email, u.external_subject, u.locale
        from auth.users u
        join auth.memberships m on m.user_id = u.id and m.is_active
        where u.id = $1::uuid
        limit 1
      `,
      [id],
      'User not found',
    );
  }

  listEvents(query: FilterInput = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const where: string[] = [];
    const values: unknown[] = [];
    addUuidFilter(where, values, 'run_id', query.runId);
    addUuidFilter(where, values, 'node_id', query.nodeId);
    addUuidFilter(where, values, 'task_id', query.taskId);
    addTextFilter(where, values, 'kind', query.kind);
    addTextFilter(where, values, 'actor_id', query.actorId);
    const whereSql = where.length > 0 ? ` where ${where.join(' and ')}` : '';

    return this.db.tx(async (trx) => {
      const rows = await trx.query<FlowRow>(
        `select * from flow.events${whereSql} order by created_at desc, id desc limit $${values.length + 1} offset $${values.length + 2}`,
        [...values, limit, offset],
      );
      const total = await trx.query<{ total: string }>(
        `select count(*)::text as total from flow.events${whereSql}`,
        values,
      );
      return {
        data: rows.rows.map(camelizeRow),
        meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  async signal(input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(signalSchema, input);
    const scopeId = dto.scopeId ?? await this.scopeIdForCode(dto.scopeCode);

    await this.buildAdapterFactsIfRegistered({
      adapterKey: dto.adapterKey,
      targetType: dto.targetType,
      targetId: dto.targetId,
      signalKey: dto.signalKey,
      payload: dto.payload,
    });

    return this.db.tx(async (trx) => {
      await trx.query('select flow.signal_changed($1::uuid, $2::text, $3::text)', [
        scopeId,
        dto.targetType,
        dto.targetId,
      ]);
      return { scopeId, targetType: dto.targetType, targetId: dto.targetId, signaled: true };
    });
  }

  private async scopeCodeForId(scopeId: string | undefined): Promise<string> {
    if (!scopeId) {
      throw new BadRequestException('scopeId or scopeCode is required');
    }
    const scope = await this.getOne(
      'select code from flow.scopes where id = $1::uuid limit 1',
      [scopeId],
      'Scope not found',
    );
    return String(scope.code);
  }

  private async scopeIdForCode(scopeCode: string | undefined): Promise<string> {
    if (!scopeCode) {
      throw new BadRequestException('scopeId or scopeCode is required');
    }
    const scope = await this.getOne(
      'select id from flow.scopes where code = $1 limit 1',
      [scopeCode],
      'Scope not found',
    );
    return String(scope.id);
  }

  private async buildAdapterFactsIfRegistered(input: {
    adapterKey?: string | undefined;
    targetType: string;
    targetId: string;
    runId?: string | undefined;
    signalKey?: string | undefined;
    payload?: Record<string, unknown> | undefined;
  }): Promise<Record<string, unknown>> {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId || !input.adapterKey) {
      return {};
    }

    try {
      return await this.adapters.buildFacts({
        tenantId,
        adapterKey: input.adapterKey,
        targetType: input.targetType,
        targetId: input.targetId,
        ...(input.runId ? { runId: input.runId } : {}),
        ...(input.signalKey ? { signalKey: input.signalKey } : {}),
        ...(input.payload ? { payload: input.payload } : {}),
      });
    } catch (error) {
      await this.recordAdapterFailure(input, error);
      throw error;
    }
  }

  private async recordAdapterFailure(
    input: {
      adapterKey?: string | undefined;
      targetType: string;
      targetId: string;
      runId?: string | undefined;
    },
    error: unknown,
  ): Promise<void> {
    if (!input.runId) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    await this.db.tx(async (trx) => {
      await trx.query(
        `
          insert into flow.events (tenant_id, run_id, kind, actor_id, payload)
          values ($1::uuid, $2::uuid, 'facts_changed', $3::uuid, $4::jsonb)
        `,
        [
          this.requestContext.tenantId,
          input.runId,
          this.requestContext.actorId ?? null,
          {
            adapterKey: input.adapterKey,
            targetType: input.targetType,
            targetId: input.targetId,
            error: message,
          },
        ],
      );
    });
  }

  private async callTaskFunction(sqlFunctionCall: string, values: unknown[]): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      await trx.query(`select ${sqlFunctionCall}`, values);
      return this.getTaskFromTransaction(trx, String(values[0]));
    });
  }

  private async assertAllowedAction(taskId: string, action: string): Promise<void> {
    await this.db.tx(async (trx) => {
      const result = await trx.query<{ allowed: boolean }>(
        `
          select $2::text = any(t.allowed_actions) as allowed
          from flow.tasks t
          where t.id = $1::uuid
          limit 1
        `,
        [taskId, action],
      );
      const allowed = result.rows[0]?.allowed;
      if (allowed === undefined) {
        throw new NotFoundException('Task not found');
      }
      if (!allowed) {
        throw new BadRequestException('Action is not allowed for this task');
      }
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  private async getTaskFromTransaction(trx: Transaction, id: string): Promise<Record<string, unknown>> {
    const result = await trx.query<FlowRow>(
      `
        select t.*, n.code as node_code, n.name as node_name, n.kind
        from flow.tasks t
        join flow.nodes n on n.id = t.node_id
        where t.id = $1::uuid
        limit 1
      `,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Task not found');
    }
    return camelizeRow(row);
  }

  private async list(sql: string, values: unknown[]): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(sql, values);
      return result.rows.map(camelizeRow);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  private async getOne(
    sql: string,
    values: unknown[],
    notFoundMessage: string,
  ): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(sql, values);
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException(notFoundMessage);
      }
      return camelizeRow(row);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  objectInput(input: unknown): Record<string, unknown> {
    return requireObject(input);
  }
}
