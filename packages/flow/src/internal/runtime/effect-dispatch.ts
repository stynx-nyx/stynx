import { executeEventsList } from './events-list.repository.js';
import { readPendingEffects } from './runtime-queries.repository.js';
import { recordEffectResult, signalChanged } from './effect-commands.repository.js';
import { BadRequestException, Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { FlowAdapterRegistry } from '../../adapters.js';
import type { FlowJsonObject } from '../../types.js';
import { dispatchEffectsSchema, parseDto, signalSchema } from '../../validation.js';
import {
  asJsonObject,
  camelizeRow,
  optionalString,
  pageLimitOffset,
  type PendingEffectRow,
  type RuntimeFilterInput,
} from './runtime-filters.js';
import { FlowRuntimeReadModel } from './runtime-read-model.js';

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
    const runId = optionalString(query.runId);
    const nodeId = optionalString(query.nodeId);
    const taskId = optionalString(query.taskId);
    const kind = optionalString(query.kind);
    const actorId = optionalString(query.actorId);

    return this.db.tx(
      async (trx) => {
        const { rows, total } = await executeEventsList(trx, runId, nodeId, taskId, kind, actorId, limit, offset);
        return {
          data: rows.map(camelizeRow),
          meta: { page, pageSize, total: Number(total[0]?.total ?? 0) },
        };
      },
      {
        role: 'reader',
        readonly: true,
      },
    );
  }

  async signal(input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(signalSchema, input);
    const scopeId = dto.scopeId ?? (await this.readModel.scopeIdForCode(dto.scopeCode));

    await this.buildAdapterFactsIfRegistered({
      adapterKey: dto.adapterKey,
      targetType: dto.targetType,
      targetId: dto.targetId,
      signalKey: dto.signalKey,
      payload: dto.payload,
    });

    return this.db.tx(async (trx) => {
      await trx.run(signalChanged, [
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
    const pending = await this.db.tx(
      async (trx) => {
        const result = await trx.run(readPendingEffects,
          [dto.runId ?? null, dto.effectEventId ?? null, limit],
        );
        return result;
      },
      {
        role: 'reader',
        readonly: true,
      },
    );

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
        diagnostics.push({
          effectEventId: event.event_id,
          ok: false,
          error: 'effectKey is required',
        });
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
    signalKey?: string | undefined;
    payload?: Record<string, unknown> | undefined;
  }): Promise<Record<string, unknown>> {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId || !input.adapterKey) {
      return {};
    }

    return this.adapters.buildFacts({
      tenantId,
      adapterKey: input.adapterKey,
      targetType: input.targetType,
      targetId: input.targetId,
      ...(input.signalKey ? { signalKey: input.signalKey } : {}),
      ...(input.payload ? { payload: input.payload } : {}),
    });
  }

  private async recordEffectResult(
    event: Pick<PendingEffectRow, 'event_id' | 'run_id' | 'node_id' | 'task_id'>,
    kind: 'effect_succeeded' | 'effect_failed',
    payload: FlowJsonObject,
  ): Promise<void> {
    await this.db.tx(async (trx) => {
      await trx.run(recordEffectResult,
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

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }
}
