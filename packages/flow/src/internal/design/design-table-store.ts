import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import {
  Database,
  Transaction,
  agentRules as flowAgentRules,
  edges as flowEdges,
  graphs as flowGraphs,
  nodeFormRules as flowNodeFormRules,
  nodes as flowNodes,
  policyRules as flowPolicyRules,
  policySets as flowPolicySets,
  scopes as flowScopes,
  transitionEffects as flowTransitionEffects,
} from '@stynx-nyx/data';
import type { FlowJsonObject } from '../../types';

export type DesignFlowRow = Record<string, unknown>;
type ColumnMap = Record<string, string>;

export interface DesignTableConfig {
  readonly sqlName: string;
  readonly columns: ColumnMap;
  readonly softDeleteTable: unknown;
  readonly auditColumns: boolean;
}

const TABLES = {
  scopes: {
    sqlName: 'flow.scopes',
    softDeleteTable: flowScopes,
    auditColumns: true,
    columns: {
      code: 'code',
      label: 'label',
      adapterKey: 'adapter_key',
      adapterConfig: 'adapter_config',
      meta: 'meta',
    },
  },
  graphs: {
    sqlName: 'flow.graphs',
    softDeleteTable: flowGraphs,
    auditColumns: true,
    columns: {
      scopeId: 'scope_id',
      code: 'code',
      version: 'version',
      isActive: 'is_active',
      name: 'name',
      description: 'description',
      meta: 'meta',
    },
  },
  nodes: {
    sqlName: 'flow.nodes',
    softDeleteTable: flowNodes,
    auditColumns: true,
    columns: {
      graphId: 'graph_id',
      code: 'code',
      name: 'name',
      kind: 'kind',
      decisionPolicy: 'decision_policy',
      quorumRatio: 'quorum_ratio',
      allowedActions: 'allowed_actions',
      slaSeconds: 'sla_seconds',
      entryRule: 'entry_rule',
      exitRule: 'exit_rule',
      sortOrder: 'sort_order',
      meta: 'meta',
    },
  },
  edges: {
    sqlName: 'flow.edges',
    softDeleteTable: flowEdges,
    auditColumns: true,
    columns: {
      graphId: 'graph_id',
      fromNodeId: 'from_node_id',
      toNodeId: 'to_node_id',
      action: 'action',
      rule: 'rule',
      spawn: 'spawn',
      sortOrder: 'sort_order',
      meta: 'meta',
    },
  },
  agentRules: {
    sqlName: 'flow.agent_rules',
    softDeleteTable: flowAgentRules,
    auditColumns: true,
    columns: {
      nodeId: 'node_id',
      ruleType: 'rule_type',
      permissionKey: 'permission_key',
      userId: 'user_id',
      resolverKey: 'resolver_key',
      params: 'params',
      sortOrder: 'sort_order',
    },
  },
  transitionEffects: {
    sqlName: 'flow.transition_effects',
    softDeleteTable: flowTransitionEffects,
    auditColumns: true,
    columns: {
      graphId: 'graph_id',
      nodeCode: 'node_code',
      action: 'action',
      effectKey: 'effect_key',
      payload: 'payload',
      sortOrder: 'sort_order',
    },
  },
  nodeFormRules: {
    sqlName: 'flow.node_form_rules',
    softDeleteTable: flowNodeFormRules,
    auditColumns: true,
    columns: {
      nodeId: 'node_id',
      formId: 'form_id',
      required: 'required',
      gatingMode: 'gating_mode',
      threshold: 'threshold',
      applicability: 'applicability',
      weight: 'weight',
      meta: 'meta',
    },
  },
  policySets: {
    sqlName: 'flow.policy_sets',
    softDeleteTable: flowPolicySets,
    auditColumns: true,
    columns: {
      scopeId: 'scope_id',
      version: 'version',
      isActive: 'is_active',
      name: 'name',
      description: 'description',
      meta: 'meta',
    },
  },
  policyRules: {
    sqlName: 'flow.policy_rules',
    softDeleteTable: flowPolicyRules,
    auditColumns: true,
    columns: {
      policySetId: 'policy_set_id',
      nodeCode: 'node_code',
      statusCode: 'status_code',
      action: 'action',
      capability: 'capability',
      effect: 'effect',
      priority: 'priority',
      reasonCode: 'reason_code',
      conditions: 'conditions',
      meta: 'meta',
    },
  },
} satisfies Record<string, DesignTableConfig>;

export type DesignTableKey = keyof typeof TABLES;

function camelizeKey(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function camelizeDesignRow(row: DesignFlowRow): FlowJsonObject {
  const mapped: FlowJsonObject = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[camelizeKey(key)] = value;
  }
  return mapped;
}

function definedEntries(input: FlowJsonObject, columns: ColumnMap): Array<[string, unknown]> {
  const entries: Array<[string, unknown]> = [];
  for (const [apiName, columnName] of Object.entries(columns)) {
    if (Object.prototype.hasOwnProperty.call(input, apiName) && input[apiName] !== undefined) {
      entries.push([columnName, input[apiName]]);
    }
  }
  return entries;
}

function ensureNonEmptyUpdate(entries: Array<[string, unknown]>): void {
  if (entries.length === 0) {
    throw new BadRequestException('At least one update field is required');
  }
}

@Injectable()
export class FlowDesignTableStore {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
  ) {}

  tableConfig(key: DesignTableKey): DesignTableConfig {
    return TABLES[key];
  }

  listRows(
    key: DesignTableKey,
    filters: Record<string, string> = {},
    orderBy = 'created_at DESC',
  ): Promise<FlowJsonObject[]> {
    const config = TABLES[key];
    return this.db.tx(async (trx) => {
      const { where, values } = this.buildWhere(filters);
      const result = await trx.query<DesignFlowRow>(
        `select * from ${config.sqlName}${where} order by ${orderBy}`,
        values,
      );
      return result.rows.map((row) => this.presentRow(key, camelizeDesignRow(row)));
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  getRow(key: DesignTableKey, id: string): Promise<FlowJsonObject> {
    const config = TABLES[key];
    return this.db.tx(async (trx) => this.presentRow(key, await this.getRowFromTransaction(trx, config, id)), {
      role: 'reader',
      readonly: true,
    });
  }

  createRow(key: DesignTableKey, input: FlowJsonObject): Promise<FlowJsonObject> {
    return this.db.tx(async (trx) => this.presentRow(key, await this.insertRow(trx, key, input)));
  }

  updateRow(key: DesignTableKey, id: string, input: FlowJsonObject): Promise<FlowJsonObject> {
    const config = TABLES[key];
    return this.db.tx(async (trx) => {
      const entries = definedEntries(input, config.columns);
      ensureNonEmptyUpdate(entries);

      if (config.auditColumns) {
        entries.push(['updated_by', this.requestContext.actorId ?? null]);
        entries.push(['updated_at', new Date()]);
      }

      const assignments = entries.map(([column], index) => `${column} = $${index + 2}`);
      const values = [id, ...entries.map(([, value]) => value)];
      const result = await trx.query<DesignFlowRow>(
        `update ${config.sqlName} set ${assignments.join(', ')} where id = $1::uuid returning *`,
        values,
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException('Flow row not found');
      }
      return this.presentRow(key, camelizeDesignRow(row));
    });
  }

  softDeleteRow(key: DesignTableKey, id: string): Promise<FlowJsonObject> {
    const config = TABLES[key];
    return this.db.tx(async (trx) => {
      await this.getRowFromTransaction(trx, config, id);
      await trx.softDelete(config.softDeleteTable as never, id);
      return { id, deleted: true };
    });
  }

  async insertRow(trx: Transaction, key: DesignTableKey, input: FlowJsonObject): Promise<FlowJsonObject> {
    const config = TABLES[key];
    const tenantId = this.requireTenantId();
    const actorId = this.requestContext.actorId ?? null;
    const entries: Array<[string, unknown]> = [['tenant_id', tenantId]];

    entries.push(...definedEntries(input, config.columns));
    if (config.auditColumns) {
      entries.push(['created_by', actorId]);
      entries.push(['updated_by', actorId]);
    }

    const columns = entries.map(([column]) => column);
    const placeholders = entries.map((_entry, index) => `$${index + 1}`);
    const result = await trx.query<DesignFlowRow>(
      `insert into ${config.sqlName} (${columns.join(', ')}) values (${placeholders.join(', ')}) returning *`,
      entries.map(([, value]) => value),
    );
    const row = result.rows[0];
    if (!row) {
      throw new BadRequestException('Flow insert did not return a row');
    }
    return this.presentRow(key, camelizeDesignRow(row));
  }

  async getRowFromTransaction(
    trx: Transaction,
    config: DesignTableConfig,
    id: string,
  ): Promise<FlowJsonObject> {
    const result = await trx.query<DesignFlowRow>(
      `select * from ${config.sqlName} where id = $1::uuid limit 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Flow row not found');
    }
    return camelizeDesignRow(row);
  }

  presentRow(key: DesignTableKey, row: FlowJsonObject): FlowJsonObject {
    return key === 'graphs' ? withGraphPublishState(row) : row;
  }

  private buildWhere(filters: Record<string, string>): { where: string; values: string[] } {
    const entries = Object.entries(filters);
    if (entries.length === 0) {
      return { where: '', values: [] };
    }

    const clauses = entries.map(([column], index) => `${column} = $${index + 1}::uuid`);
    return {
      where: ` where ${clauses.join(' and ')}`,
      values: entries.map(([, value]) => value),
    };
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }
}

const GRAPH_PUBLISH_META_KEY = 'publish';

export function withGraphPublishState(row: FlowJsonObject): FlowJsonObject {
  const publish = graphPublishMeta(row.meta);
  return {
    ...row,
    status: publish ? 'published' : 'draft',
    ...(publish
      ? {
          publishedVersion: publish.publishedVersion,
          publishedAt: publish.publishedAt,
          publishedBy: publish.publishedBy ?? null,
        }
      : {}),
  };
}

export function graphPublishMeta(meta: unknown): {
  publishedVersion: number;
  publishedAt: string;
  publishedBy?: string | null;
} | null {
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const publish = (meta as Record<string, unknown>)[GRAPH_PUBLISH_META_KEY];
  if (publish === null || typeof publish !== 'object' || Array.isArray(publish)) {
    return null;
  }
  const publishedVersion = (publish as Record<string, unknown>).publishedVersion;
  const publishedAt = (publish as Record<string, unknown>).publishedAt;
  if (typeof publishedVersion !== 'number' || !Number.isFinite(publishedVersion) || typeof publishedAt !== 'string') {
    return null;
  }
  const publishedBy = (publish as Record<string, unknown>).publishedBy;
  return {
    publishedVersion,
    publishedAt,
    publishedBy: typeof publishedBy === 'string' ? publishedBy : null,
  };
}

export function jsonObject(value: unknown): FlowJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as FlowJsonObject
    : {};
}

export function requireString(value: unknown, label: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new BadRequestException(`${label} is required`);
}
