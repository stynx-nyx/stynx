import { readTaskAccess } from './runtime-queries.repository.js';
import { readAllowedTaskAction } from './runtime-queries.repository.js';
import { completeTask, assignTask, unassignTask, acceptTask, declineTask, unacceptTask, withdrawTask } from './task-commands.repository.js';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { FlowAdapterRegistry } from '../../adapters.js';
import {
  assignTaskSchema,
  parseDto,
  taskActionSchema,
  taskNoteSchema,
} from '../../validation.js';
import {
  addTextFilter,
  addUuidFilter,
  asJsonObject,
  camelizeRow,
  optionalString,
  pageLimitOffset,
  type FlowRow,
  type RuntimeFilterInput,
  type TaskAccessRow,
} from './runtime-filters.js';
import { FlowRuntimeReadModel } from './runtime-read-model.js';

@Injectable()
export class FlowTaskDispatch {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
    private readonly adapters: FlowAdapterRegistry,
    private readonly readModel: FlowRuntimeReadModel,
  ) {}

  listTasks(query: RuntimeFilterInput = {}): Promise<Record<string, unknown>> {
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
    return this.readModel.getTask(id);
  }

  async actTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskActionSchema, input);
    await this.assertAllowedAction(id, dto.action);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction(id, (trx) => trx.run(completeTask, [
      id,
      dto.action,
      dto.note ?? null,
      dto.payload ?? {},
    ]));
  }

  async assignTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(assignTaskSchema, input);
    await this.assertTaskManagementAllowed(id);
    return this.callTaskFunction(id, (trx) => trx.run(assignTask, [
      id,
      dto.userId,
      dto.note ?? null,
    ]));
  }

  async unassignTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskManagementAllowed(id);
    return this.callTaskFunction(id, (trx) => trx.run(unassignTask, [id, dto.note ?? null]));
  }

  async acceptTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction(id, (trx) => trx.run(acceptTask, [id, dto.note ?? null]));
  }

  async declineTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction(id, (trx) => trx.run(declineTask, [id, dto.note ?? null]));
  }

  async unacceptTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction(id, (trx) => trx.run(unacceptTask, [id, dto.note ?? null]));
  }

  async withdrawTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction(id, (trx) => trx.run(withdrawTask, [id, dto.note ?? null]));
  }

  async taskCandidates(id: string): Promise<Record<string, unknown>[]> {
    await this.assertTaskManagementAllowed(id);
    const candidates = await this.readModel.taskCandidates(id);
    const resolved: Record<string, unknown>[] = [];
    for (const candidate of candidates) {
      if (candidate.agentType !== 'resolver') {
        resolved.push(candidate);
        continue;
      }
      const resolverKey = String(candidate.agentId ?? '');
      const adapterKey = optionalString(candidate.adapterKey);
      if (!this.requestContext.tenantId || !adapterKey || !resolverKey) {
        resolved.push(candidate);
        continue;
      }
      const agents = await this.adapters.resolveAgents({
        tenantId: this.requestContext.tenantId,
        adapterKey,
        targetType: String(candidate.targetType ?? ''),
        targetId: String(candidate.targetId ?? ''),
        runId: String(candidate.runId ?? ''),
        nodeId: String(candidate.nodeId ?? ''),
        ruleId: String(candidate.ruleId ?? ''),
        resolverKey,
        params: asJsonObject(candidate.params),
      });
      if (agents.length === 0) {
        resolved.push({ ...candidate, unresolved: true, resolverKey });
        continue;
      }
      for (const agent of agents) {
        resolved.push({
          agentType: agent.type,
          agentId: agent.id,
          ...(agent.label ? { label: agent.label } : {}),
          ruleId: candidate.ruleId,
          resolverKey,
        });
      }
    }
    return resolved;
  }

  listUsersForRole(role: string, search?: string): Promise<Record<string, unknown>[]> {
    return this.readModel.listUsersForRole(role, search);
  }

  getTaskUser(id: string): Promise<Record<string, unknown>> {
    return this.readModel.getTaskUser(id);
  }

  private async callTaskFunction(
    taskId: string,
    run: (trx: Transaction) => Promise<unknown>,
  ): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      await run(trx);
      return this.readModel.getTaskFromTransaction(trx, taskId);
    });
  }

  private async assertAllowedAction(taskId: string, action: string): Promise<void> {
    await this.db.tx(async (trx) => {
      const result = await trx.run(readAllowedTaskAction,
        [taskId, action],
      );
      const allowed = result[0]?.allowed;
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

  private async assertTaskExecutionAllowed(taskId: string): Promise<void> {
    const actorId = this.requestContext.actorId;
    if (!actorId) {
      throw new ForbiddenException('Task actor context is required');
    }
    const access = await this.taskAccess(taskId, actorId);
    if (access.assignee_user_id && access.assignee_user_id !== actorId) {
      throw new ForbiddenException('Only the current assignee may execute this task');
    }
    if (!access.assignee_user_id && !access.is_user_candidate) {
      throw new ForbiddenException('Actor is not a task candidate');
    }
  }

  private async assertTaskManagementAllowed(taskId: string): Promise<void> {
    const access = await this.taskAccess(taskId, this.requestContext.actorId);
    const actorId = this.requestContext.actorId;
    const allowed = await this.adapters.canManage({
      tenantId: this.requireTenantId(),
      adapterKey: access.adapter_key,
      targetType: access.target_type,
      targetId: access.target_id,
      ...(actorId ? { actorId } : {}),
    });
    if (!allowed) {
      throw new ForbiddenException('Adapter denied Flow task management');
    }
  }

  private async taskAccess(taskId: string, actorId: string | undefined): Promise<TaskAccessRow> {
    return this.db.tx(async (trx) => {
      const result = await trx.run(readTaskAccess,
        [taskId, actorId ?? ''],
      );
      const row = result[0];
      if (!row) {
        throw new NotFoundException('Task not found');
      }
      return row;
    }, {
      role: 'reader',
      readonly: true,
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
