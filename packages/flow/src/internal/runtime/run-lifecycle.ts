import { executeRunsList } from './runs-list.repository.js';
import { buildRunFactsQuery, updateRunStatusQuery, isRunLifecycleRow } from './run-lifecycle.repository.js';
import { executeNodeRunsList } from './node-runs-list.repository.js';
import { ensureFlowRun } from './runtime-queries.repository.js';
import { recordAdapterFailure } from './effect-commands.repository.js';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { FlowAdapterRegistry } from '../../adapters.js';
import {
  ensureRunSchema,
  parseDto,
  updateRunSchema,
} from '../../validation.js';
import {
  camelizeRow,
  optionalString,
  pageLimitOffset,
  type RuntimeFilterInput,
} from './runtime-filters.js';
import { FlowRuntimeReadModel } from './runtime-read-model.js';

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
      const result = await trx.run(ensureFlowRun,
        [dto.graphCode, dto.version, scopeCode, dto.adapterKey ?? null, dto.targetType, dto.targetId],
      );
      const runId = result[0]?.run_id;
      if (!runId) {
        throw new BadRequestException('Flow run was not created');
      }
      return { runId };
    });
  }

  listRuns(query: RuntimeFilterInput = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const scopeId = optionalString(query.scopeId);
    const graphId = optionalString(query.graphId);
    const targetType = optionalString(query.targetType);
    const targetId = optionalString(query.targetId);
    const status = optionalString(query.status);

    return this.db.tx(async (trx) => {
      const { rows, total } = await executeRunsList(trx, scopeId, graphId, targetType, targetId, status, limit, offset);
      return {
        data: rows.map(camelizeRow),
        meta: {
          page,
          pageSize,
          total: Number(total[0]?.total ?? 0),
        },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  getRun(id: string): Promise<Record<string, unknown>> {
    return this.readModel.getRun(id);
  }

  updateRun(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(updateRunSchema, input);
    return this.db.tx(async (trx) => {
      const result = await trx.runGuarded(updateRunStatusQuery,
        [id, dto.status, this.requestContext.actorId ?? null],
        isRunLifecycleRow,
      );
      const row = result[0];
      if (!row) {
        throw new NotFoundException('Run not found');
      }
      return camelizeRow(row);
    });
  }

  listRunNodeRuns(runId: string): Promise<Record<string, unknown>[]> {
    return this.readModel.listRunNodeRuns(runId);
  }

  listRunTasks(runId: string): Promise<Record<string, unknown>[]> {
    return this.readModel.listRunTasks(runId);
  }

  listRunEvents(runId: string): Promise<Record<string, unknown>[]> {
    return this.readModel.listRunEvents(runId);
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
      const result = await trx.run(buildRunFactsQuery,
        [run.scopeId, run.targetType, run.targetId],
      );
      return {
        ...(result[0]?.facts ?? {}),
        adapter: adapterFacts,
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  listNodeRuns(query: RuntimeFilterInput = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const runId = optionalString(query.runId);
    const status = optionalString(query.status);

    return this.db.tx(async (trx) => {
      const { rows, total } = await executeNodeRunsList(trx, runId, status, limit, offset);
      return {
        data: rows.map(camelizeRow),
        meta: { page, pageSize, total: Number(total[0]?.total ?? 0) },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  getNodeRun(id: string): Promise<Record<string, unknown>> {
    return this.readModel.getNodeRun(id);
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
    const runId = input.runId;
    if (!runId) {
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    await this.db.tx(async (trx) => {
      await trx.run(recordAdapterFailure,
        [
          this.requestContext.tenantId,
          runId,
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
