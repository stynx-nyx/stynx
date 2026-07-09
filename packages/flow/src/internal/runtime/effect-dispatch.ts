import { BadRequestException, Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { FlowAdapterRegistry } from '../../adapters';
import type { FlowJsonObject } from '../../types';
import {
  dispatchEffectsSchema,
  parseDto,
  signalSchema,
} from '../../validation';
import {
  addTextFilter,
  addUuidFilter,
  asJsonObject,
  camelizeRow,
  optionalString,
  pageLimitOffset,
  type FlowRow,
  type PendingEffectRow,
  type RuntimeFilterInput,
} from './runtime-filters';
import { FlowRuntimeReadModel } from './runtime-read-model';

@Injectable()
export class FlowEffectDispatch {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
    private readonly adapters: FlowAdapterRegistry,
    private readonly readModel: FlowRuntimeReadModel,
  ) {}

  listEvents(query: RuntimeFilterInput = {}): Promise<Record<string, unknown>> {
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
    const scopeId = dto.scopeId ?? await this.readModel.scopeIdForCode(dto.scopeCode);

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

  async dispatchPendingEffects(input: unknown = {}): Promise<Record<string, unknown>> {
    const dto = parseDto(dispatchEffectsSchema, input);
    const limit = dto.limit ?? 50;
    const pending = await this.db.tx(async (trx) => {
      const result = await trx.query<PendingEffectRow>(
        `
          select
            e.id as event_id,
            e.run_id,
            e.node_id,
            e.task_id,
            e.payload,
            r.adapter_key,
            r.target_type,
            r.target_id,
            n.code as node_code,
            t.decided_action as action
          from flow.events e
          join flow.runs r on r.id = e.run_id
          left join flow.nodes n on n.id = e.node_id
          left join flow.tasks t on t.id = e.task_id
          where e.kind = 'effect_requested'
            and ($1::uuid is null or e.run_id = $1::uuid)
            and ($2::uuid is null or e.id = $2::uuid)
            and not exists (
              select 1
              from flow.events terminal
              where terminal.run_id = e.run_id
                and terminal.kind in ('effect_succeeded', 'effect_failed')
                and terminal.payload ->> 'effectEventId' = e.id::text
            )
          order by e.created_at, e.id
          limit $3
        `,
        [dto.runId ?? null, dto.effectEventId ?? null, limit],
      );
      return result.rows;
    }, {
      role: 'reader',
      readonly: true,
    });

    let succeeded = 0;
    let failed = 0;
    const diagnostics: Record<string, unknown>[] = [];
    for (const event of pending) {
      const payload = asJsonObject(event.payload);
      const effectKey = optionalString(payload.effectKey);
      if (!effectKey) {
        failed += 1;
        await this.recordEffectResult(event, 'effect_failed', {
          error: 'effectKey is required',
          effectEventId: event.event_id,
        });
        diagnostics.push({ effectEventId: event.event_id, ok: false, error: 'effectKey is required' });
        continue;
      }

      try {
        const result = await this.adapters.applyEffect({
          tenantId: this.requireTenantId(),
          adapterKey: event.adapter_key,
          targetType: event.target_type,
          targetId: event.target_id,
          runId: event.run_id,
          effectKey,
          ...(event.node_code ? { nodeCode: event.node_code } : {}),
          ...(event.action ? { action: event.action } : {}),
          payload: asJsonObject(payload.payload),
        });
        succeeded += 1;
        await this.recordEffectResult(event, 'effect_succeeded', {
          effectEventId: event.event_id,
          effectKey,
          ok: result.ok,
          ...(result.payload ? { result: result.payload } : {}),
        });
        diagnostics.push({ effectEventId: event.event_id, ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed += 1;
        await this.recordEffectResult(event, 'effect_failed', {
          effectEventId: event.event_id,
          effectKey,
          error: message,
        });
        diagnostics.push({ effectEventId: event.event_id, ok: false, error: message });
      }
    }

    return {
      attempted: pending.length,
      succeeded,
      failed,
      skipped: 0,
      diagnostics,
    };
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

  private async recordEffectResult(
    event: PendingEffectRow,
    kind: 'effect_succeeded' | 'effect_failed',
    payload: FlowJsonObject,
  ): Promise<void> {
    await this.db.tx(async (trx) => {
      await trx.query(
        `
          insert into flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, payload)
          values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::flow.event_kind, $6::uuid, $7::jsonb)
        `,
        [
          this.requireTenantId(),
          event.run_id,
          event.node_id ?? null,
          event.task_id ?? null,
          kind,
          this.requestContext.actorId ?? null,
          payload,
        ],
      );
    });
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

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }
}
