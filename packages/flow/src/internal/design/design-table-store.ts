import { executeGraphsCreate, executeGraphsUpdate, executeTransitionEffectsCreate, executeTransitionEffectsUpdate, executePolicySetsCreate, executePolicySetsUpdate } from './small-mutations.repository.js';
import { executeEdgesCreate, executeEdgesUpdate, executeAgentRulesCreate, executeAgentRulesUpdate, executeNodeFormRulesCreate, executeNodeFormRulesUpdate } from './linked-mutations.repository.js';
import { executePolicyRulesCreate, executePolicyRulesUpdate } from './policy-mutations.repository.js';
import { executeScopeCreate, executeScopeUpdate } from './scope-mutations.repository.js';
import { executeDesignList, executeDesignGet } from './design-read.repository.js';
import { selectNodeInsertQuery } from './generated/nodes-insert.repository.js';
import { selectNodeUpdateQuery } from './generated/nodes-update.repository.js';
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
import type { FlowJsonObject } from '../../types.js';

export type DesignFlowRow = Record<string, unknown>;

function isOpaqueNodeRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

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

function nodeMutationMask(
  entries: ReadonlyArray<readonly [string, unknown]>,
): number {
  const columns: readonly string[] = Object.values(TABLES.nodes.columns);
  let mask = 0;
  for (const [column] of entries) {
    const index = columns.indexOf(column);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

function remainingDesignMutationMask(
  key: Exclude<DesignTableKey, 'nodes' | 'scopes'>,
  entries: ReadonlyArray<readonly [string, unknown]>,
): number {
  const columns: readonly string[] = Object.values(TABLES[key].columns);
  let mask = 0;
  for (const [column] of entries) {
    const index = columns.indexOf(column);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
}

function scopeMutationMask(entries: ReadonlyArray<readonly [string, unknown]>): number {
  const columns: readonly string[] = Object.values(TABLES.scopes.columns);
  let mask = 0;
  for (const [column] of entries) {
    const index = columns.indexOf(column);
    if (index >= 0) mask |= 1 << index;
  }
  return mask;
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

  listRows(key: DesignTableKey, filterId?: string): Promise<FlowJsonObject[]> {
    return this.db.tx(async (trx) => {
      const rows = await executeDesignList(trx, key, filterId);
      return rows.map((row) => this.presentRow(key, camelizeDesignRow(row)));
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  getRow(key: DesignTableKey, id: string): Promise<FlowJsonObject> {
    return this.db.tx(async (trx) => this.presentRow(key, await this.getRowFromTransaction(trx, key, id)), {
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

      const values = [id, ...entries.map(([, value]) => value)];
      const rows = key === 'scopes'
        ? await executeScopeUpdate(trx, scopeMutationMask(entries), values)
        : key === 'nodes'
        ? await trx.runGuarded(selectNodeUpdateQuery(nodeMutationMask(entries)), values, isOpaqueNodeRow)
        : key === 'graphs'
        ? await executeGraphsUpdate(trx, remainingDesignMutationMask(key, entries), values)
        : key === 'transitionEffects'
        ? await executeTransitionEffectsUpdate(trx, remainingDesignMutationMask(key, entries), values)
        : key === 'policySets'
        ? await executePolicySetsUpdate(trx, remainingDesignMutationMask(key, entries), values)
        : key === 'edges'
        ? await executeEdgesUpdate(trx, remainingDesignMutationMask(key, entries), values)
        : key === 'agentRules'
        ? await executeAgentRulesUpdate(trx, remainingDesignMutationMask(key, entries), values)
        : key === 'nodeFormRules'
        ? await executeNodeFormRulesUpdate(trx, remainingDesignMutationMask(key, entries), values)
        : await executePolicyRulesUpdate(trx, remainingDesignMutationMask(key, entries), values);
      const row = rows[0];
      if (!row) {
        throw new NotFoundException('Flow row not found');
      }
      return this.presentRow(key, camelizeDesignRow(row));
    });
  }

  softDeleteRow(key: DesignTableKey, id: string): Promise<FlowJsonObject> {
    const config = TABLES[key];
    return this.db.tx(async (trx) => {
      await this.getRowFromTransaction(trx, key, id);
      await trx.softDelete(config.softDeleteTable, id);
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

    const values = entries.map(([, value]) => value);
    const rows = key === 'scopes'
      ? await executeScopeCreate(trx, scopeMutationMask(entries), values)
      : key === 'nodes'
      ? await trx.runGuarded(selectNodeInsertQuery(nodeMutationMask(entries)), values, isOpaqueNodeRow)
      : key === 'graphs'
      ? await executeGraphsCreate(trx, remainingDesignMutationMask(key, entries), values)
      : key === 'transitionEffects'
      ? await executeTransitionEffectsCreate(trx, remainingDesignMutationMask(key, entries), values)
      : key === 'policySets'
      ? await executePolicySetsCreate(trx, remainingDesignMutationMask(key, entries), values)
      : key === 'edges'
      ? await executeEdgesCreate(trx, remainingDesignMutationMask(key, entries), values)
      : key === 'agentRules'
      ? await executeAgentRulesCreate(trx, remainingDesignMutationMask(key, entries), values)
      : key === 'nodeFormRules'
      ? await executeNodeFormRulesCreate(trx, remainingDesignMutationMask(key, entries), values)
      : await executePolicyRulesCreate(trx, remainingDesignMutationMask(key, entries), values);
    const row = rows[0];
    if (!row) {
      throw new BadRequestException('Flow insert did not return a row');
    }
    return this.presentRow(key, camelizeDesignRow(row));
  }

  async getRowFromTransaction(
    trx: Transaction,
    key: DesignTableKey,
    id: string,
  ): Promise<FlowJsonObject> {
    const rows = await executeDesignGet(trx, key, id);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Flow row not found');
    }
    return camelizeDesignRow(row);
  }

  presentRow(key: DesignTableKey, row: FlowJsonObject): FlowJsonObject {
    return key === 'graphs' ? withGraphPublishState(row) : row;
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function graphPublishMeta(meta: unknown): {
  publishedVersion: number;
  publishedAt: string;
  publishedBy?: string | null;
} | null {
  if (!isObjectRecord(meta)) {
    return null;
  }
  const publish = meta[GRAPH_PUBLISH_META_KEY];
  if (!isObjectRecord(publish)) {
    return null;
  }
  const publishedVersion = publish.publishedVersion;
  const publishedAt = publish.publishedAt;
  if (typeof publishedVersion !== 'number' || !Number.isFinite(publishedVersion) || typeof publishedAt !== 'string') {
    return null;
  }
  const publishedBy = publish.publishedBy;
  return {
    publishedVersion,
    publishedAt,
    publishedBy: typeof publishedBy === 'string' ? publishedBy : null,
  };
}

export function jsonObject(value: unknown): FlowJsonObject {
  return isObjectRecord(value) ? value : {};
}

export function requireString(value: unknown, label: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new BadRequestException(`${label} is required`);
}
