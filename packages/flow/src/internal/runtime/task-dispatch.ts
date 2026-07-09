import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database } from '@stynx-nyx/data';
import { FlowAdapterRegistry } from '../../adapters';
import {
  assignTaskSchema,
  parseDto,
  taskActionSchema,
  taskNoteSchema,
} from '../../validation';
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
} from './runtime-filters';
import { FlowRuntimeReadModel } from './runtime-read-model';

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
    return this.readModel.getOne(
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
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction('flow.task_complete($1::uuid, $2::text, $3::text, $4::jsonb)', [
      id,
      dto.action,
      dto.note ?? null,
      dto.payload ?? {},
    ]);
  }

  async assignTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(assignTaskSchema, input);
    await this.assertTaskManagementAllowed(id);
    return this.callTaskFunction('flow.task_assign($1::uuid, $2::uuid, $3::text)', [
      id,
      dto.userId,
      dto.note ?? null,
    ]);
  }

  async unassignTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskManagementAllowed(id);
    return this.callTaskFunction('flow.task_unassign($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  async acceptTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction('flow.task_accept($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  async declineTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction('flow.task_decline($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  async unacceptTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction('flow.task_unaccept($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  async withdrawTask(id: string, input: unknown): Promise<Record<string, unknown>> {
    const dto = parseDto(taskNoteSchema, input);
    await this.assertTaskExecutionAllowed(id);
    return this.callTaskFunction('flow.task_withdraw($1::uuid, $2::text)', [id, dto.note ?? null]);
  }

  async taskCandidates(id: string): Promise<Record<string, unknown>[]> {
    await this.assertTaskManagementAllowed(id);
    const candidates = await this.readModel.list(
      `
        select
          candidate.*,
          rule.params,
          t.run_id,
          t.node_id,
          r.adapter_key,
          r.target_type,
          r.target_id
        from flow.tasks t
        cross join lateral flow.resolve_agents(t.node_id, t.run_id) candidate
        left join flow.agent_rules rule on rule.id = candidate.rule_id
        join flow.runs r on r.id = t.run_id
        where t.id = $1::uuid
      `,
      [id],
    );
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
    const values: unknown[] = [role];
    const searchSql = optionalString(search)
      ? ` and (u.email::text ilike $2 or u.external_subject ilike $2)`
      : '';
    if (searchSql) {
      values.push(`%${search}%`);
    }

    return this.readModel.list(
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
    return this.readModel.getOne(
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

  private async callTaskFunction(sqlFunctionCall: string, values: unknown[]): Promise<Record<string, unknown>> {
    return this.db.tx(async (trx) => {
      await trx.query(`select ${sqlFunctionCall}`, values);
      return this.readModel.getTaskFromTransaction(trx, String(values[0]));
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
      const result = await trx.query<TaskAccessRow>(
        `
          select
            t.assignee_user_id as assignee_user_id,
            r.adapter_key,
            r.target_type,
            r.target_id,
            exists (
              select 1
              from flow.resolve_agents(t.node_id, t.run_id) candidate
              where candidate.agent_type = 'user'
                and candidate.agent_id = $2::text
            ) as is_user_candidate
          from flow.tasks t
          join flow.runs r on r.id = t.run_id
          where t.id = $1::uuid
          limit 1
        `,
        [taskId, actorId ?? ''],
      );
      const row = result.rows[0];
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
