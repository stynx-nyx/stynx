import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database } from '@stynx/data';
import { FlowAdapterRegistry } from '../../adapters';
import {
  ensureRunSchema,
  parseDto,
  updateRunSchema,
} from '../../validation';
import {
  addTextFilter,
  addUuidFilter,
  camelizeRow,
  optionalString,
  pageLimitOffset,
  type FlowRow,
  type RuntimeFilterInput,
} from './runtime-filters';
import { FlowRuntimeReadModel } from './runtime-read-model';

@Injectable()
export class FlowRunLifecycle {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
    private readonly adapters: FlowAdapterRegistry,
    private readonly readModel: FlowRuntimeReadModel,
  ) {}

  async ensureRun(input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(ensureRunSchema, input);
    const scopeCode = dto.scopeCode ?? await this.readModel.scopeCodeForId(dto.scopeId);

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

  listRuns(query: RuntimeFilterInput = {}): Promise<Record<string, unknown>> {
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
    return this.readModel.getOne('select * from flow.runs where id = $1::uuid limit 1', [id], 'Run not found');
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
    return this.readModel.list(
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
    return this.readModel.list(
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
    return this.readModel.list(
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

  listNodeRuns(query: RuntimeFilterInput = {}): Promise<Record<string, unknown>> {
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
    return this.readModel.getOne(
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
}
