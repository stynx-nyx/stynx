import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
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
} from '@stynx/data';
import {
  createAgentRuleSchema,
  createEdgeSchema,
  createGraphSchema,
  createNodeFormRuleSchema,
  createNodeSchema,
  createPolicyRuleSchema,
  createPolicySetSchema,
  createScopeSchema,
  createTransitionEffectSchema,
  graphImportSchema,
  parseDto,
  updateAgentRuleSchema,
  updateEdgeSchema,
  updateGraphSchema,
  updateNodeFormRuleSchema,
  updateNodeSchema,
  updatePolicyRuleSchema,
  updatePolicySetSchema,
  updateScopeSchema,
  updateTransitionEffectSchema,
} from './validation';
import type { FlowGraphExportDocument, FlowGraphImportDocument, FlowJsonObject } from './types';

type FlowRow = Record<string, unknown>;
type ColumnMap = Record<string, string>;

interface TableConfig {
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
} satisfies Record<string, TableConfig>;

type TableKey = keyof typeof TABLES;

function camelizeKey(value: string): string {
  return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function camelizeRow(row: FlowRow): FlowJsonObject {
  const mapped: FlowJsonObject = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[camelizeKey(key)] = value;
  }
  return mapped;
}

function requireString(value: unknown, label: string): string {
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  throw new BadRequestException(`${label} is required`);
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
export class FlowDesignService {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
  ) {}

  listScopes(): Promise<FlowJsonObject[]> {
    return this.listRows('scopes');
  }

  getScope(id: string): Promise<FlowJsonObject> {
    return this.getRow('scopes', id);
  }

  createScope(input: unknown): Promise<FlowJsonObject> {
    return this.createRow('scopes', parseDto(createScopeSchema, input));
  }

  updateScope(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('scopes', id, parseDto(updateScopeSchema, input));
  }

  deleteScope(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('scopes', id);
  }

  listGraphs(scopeId?: string): Promise<FlowJsonObject[]> {
    return this.listRows('graphs', scopeId ? { scope_id: scopeId } : {});
  }

  getGraph(id: string): Promise<FlowJsonObject> {
    return this.getRow('graphs', id);
  }

  createGraph(input: unknown): Promise<FlowJsonObject> {
    return this.createRow('graphs', parseDto(createGraphSchema, input));
  }

  updateGraph(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('graphs', id, parseDto(updateGraphSchema, input));
  }

  deleteGraph(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('graphs', id);
  }

  listGraphNodes(graphId: string): Promise<FlowJsonObject[]> {
    return this.listRows('nodes', { graph_id: graphId }, 'sort_order, code');
  }

  createGraphNode(graphId: string, input: unknown): Promise<FlowJsonObject> {
    return this.createRow('nodes', parseDto(createNodeSchema, { ...this.objectInput(input), graphId }));
  }

  updateNode(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('nodes', id, parseDto(updateNodeSchema, input));
  }

  getNode(id: string): Promise<FlowJsonObject> {
    return this.getRow('nodes', id);
  }

  deleteNode(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('nodes', id);
  }

  listGraphEdges(graphId: string): Promise<FlowJsonObject[]> {
    return this.listRows('edges', { graph_id: graphId }, 'sort_order, action NULLS FIRST');
  }

  createGraphEdge(graphId: string, input: unknown): Promise<FlowJsonObject> {
    return this.createRow('edges', parseDto(createEdgeSchema, { ...this.objectInput(input), graphId }));
  }

  updateEdge(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('edges', id, parseDto(updateEdgeSchema, input));
  }

  getEdge(id: string): Promise<FlowJsonObject> {
    return this.getRow('edges', id);
  }

  deleteEdge(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('edges', id);
  }

  listNodeAgentRules(nodeId: string): Promise<FlowJsonObject[]> {
    return this.listRows('agentRules', { node_id: nodeId }, 'sort_order, id');
  }

  createNodeAgentRule(nodeId: string, input: unknown): Promise<FlowJsonObject> {
    return this.createRow('agentRules', parseDto(createAgentRuleSchema, { ...this.objectInput(input), nodeId }));
  }

  updateAgentRule(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('agentRules', id, parseDto(updateAgentRuleSchema, input));
  }

  getAgentRule(id: string): Promise<FlowJsonObject> {
    return this.getRow('agentRules', id);
  }

  deleteAgentRule(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('agentRules', id);
  }

  listGraphTransitionEffects(graphId: string): Promise<FlowJsonObject[]> {
    return this.listRows('transitionEffects', { graph_id: graphId }, 'sort_order, id');
  }

  createGraphTransitionEffect(graphId: string, input: unknown): Promise<FlowJsonObject> {
    return this.createRow(
      'transitionEffects',
      parseDto(createTransitionEffectSchema, { ...this.objectInput(input), graphId }),
    );
  }

  updateTransitionEffect(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('transitionEffects', id, parseDto(updateTransitionEffectSchema, input));
  }

  getTransitionEffect(id: string): Promise<FlowJsonObject> {
    return this.getRow('transitionEffects', id);
  }

  deleteTransitionEffect(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('transitionEffects', id);
  }

  listNodeFormRules(nodeId: string): Promise<FlowJsonObject[]> {
    return this.listRows('nodeFormRules', { node_id: nodeId }, 'id');
  }

  createNodeFormRule(nodeId: string, input: unknown): Promise<FlowJsonObject> {
    return this.createRow('nodeFormRules', parseDto(createNodeFormRuleSchema, { ...this.objectInput(input), nodeId }));
  }

  updateNodeFormRule(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('nodeFormRules', id, parseDto(updateNodeFormRuleSchema, input));
  }

  getNodeFormRule(id: string): Promise<FlowJsonObject> {
    return this.getRow('nodeFormRules', id);
  }

  deleteNodeFormRule(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('nodeFormRules', id);
  }

  listPolicySets(scopeId?: string): Promise<FlowJsonObject[]> {
    return this.listRows('policySets', scopeId ? { scope_id: scopeId } : {}, 'version, id');
  }

  createPolicySet(input: unknown): Promise<FlowJsonObject> {
    return this.createRow('policySets', parseDto(createPolicySetSchema, input));
  }

  updatePolicySet(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('policySets', id, parseDto(updatePolicySetSchema, input));
  }

  getPolicySet(id: string): Promise<FlowJsonObject> {
    return this.getRow('policySets', id);
  }

  deletePolicySet(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('policySets', id);
  }

  listPolicyRules(policySetId: string): Promise<FlowJsonObject[]> {
    return this.listRows('policyRules', { policy_set_id: policySetId }, 'priority, id');
  }

  createPolicyRule(policySetId: string, input: unknown): Promise<FlowJsonObject> {
    return this.createRow('policyRules', parseDto(createPolicyRuleSchema, { ...this.objectInput(input), policySetId }));
  }

  updatePolicyRule(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.updateRow('policyRules', id, parseDto(updatePolicyRuleSchema, input));
  }

  getPolicyRule(id: string): Promise<FlowJsonObject> {
    return this.getRow('policyRules', id);
  }

  deletePolicyRule(id: string): Promise<FlowJsonObject> {
    return this.softDeleteRow('policyRules', id);
  }

  importGraph(input: unknown): Promise<FlowGraphExportDocument> {
    const document = parseDto(graphImportSchema, input) as FlowGraphImportDocument;
    this.validateImport(document);

    return this.db.tx(async (trx) => {
      const graph = await this.insertRow(trx, 'graphs', document.graph);
      const graphId = requireString(graph.id, 'graph.id');
      const nodeIds = new Map<string, string>();

      for (const node of document.nodes) {
        const row = await this.insertRow(trx, 'nodes', { ...node, graphId });
        nodeIds.set(node.code, requireString(row.id, `node ${node.code}`));
      }

      for (const edge of document.edges ?? []) {
        await this.insertRow(trx, 'edges', {
          graphId,
          fromNodeId: nodeIds.get(edge.fromNodeCode),
          toNodeId: nodeIds.get(edge.toNodeCode),
          action: edge.action,
          rule: edge.rule,
          spawn: edge.spawn,
          sortOrder: edge.sortOrder,
          meta: edge.meta,
        });
      }

      for (const effect of document.transitionEffects ?? []) {
        await this.insertRow(trx, 'transitionEffects', { ...effect, graphId });
      }

      for (const rule of document.agentRules ?? []) {
        await this.insertRow(trx, 'agentRules', {
          ...rule,
          nodeId: nodeIds.get(rule.nodeCode),
        });
      }

      for (const rule of document.nodeFormRules ?? []) {
        await this.insertRow(trx, 'nodeFormRules', {
          ...rule,
          nodeId: nodeIds.get(rule.nodeCode),
        });
      }

      return this.exportGraphFromTransaction(trx, graphId);
    });
  }

  exportGraph(id: string): Promise<FlowGraphExportDocument> {
    return this.db.tx((trx) => this.exportGraphFromTransaction(trx, id), {
      role: 'reader',
      readonly: true,
    });
  }

  private async listRows(
    key: TableKey,
    filters: Record<string, string> = {},
    orderBy = 'created_at DESC',
  ): Promise<FlowJsonObject[]> {
    const config = TABLES[key];
    return this.db.tx(async (trx) => {
      const { where, values } = this.buildWhere(filters);
      const result = await trx.query<FlowRow>(
        `select * from ${config.sqlName}${where} order by ${orderBy}`,
        values,
      );
      return result.rows.map(camelizeRow);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  private async getRow(key: TableKey, id: string): Promise<FlowJsonObject> {
    const config = TABLES[key];
    return this.db.tx(async (trx) => this.getRowFromTransaction(trx, config, id), {
      role: 'reader',
      readonly: true,
    });
  }

  private async createRow(key: TableKey, input: FlowJsonObject): Promise<FlowJsonObject> {
    return this.db.tx((trx) => this.insertRow(trx, key, input));
  }

  private async updateRow(key: TableKey, id: string, input: FlowJsonObject): Promise<FlowJsonObject> {
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
      const result = await trx.query<FlowRow>(
        `update ${config.sqlName} set ${assignments.join(', ')} where id = $1::uuid returning *`,
        values,
      );
      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException('Flow row not found');
      }
      return camelizeRow(row);
    });
  }

  private async softDeleteRow(key: TableKey, id: string): Promise<FlowJsonObject> {
    const config = TABLES[key];
    return this.db.tx(async (trx) => {
      await this.getRowFromTransaction(trx, config, id);
      await trx.softDelete(config.softDeleteTable as never, id);
      return { id, deleted: true };
    });
  }

  private async insertRow(trx: Transaction, key: TableKey, input: FlowJsonObject): Promise<FlowJsonObject> {
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
    const result = await trx.query<FlowRow>(
      `insert into ${config.sqlName} (${columns.join(', ')}) values (${placeholders.join(', ')}) returning *`,
      entries.map(([, value]) => value),
    );
    const row = result.rows[0];
    if (!row) {
      throw new BadRequestException('Flow insert did not return a row');
    }
    return camelizeRow(row);
  }

  private async getRowFromTransaction(
    trx: Transaction,
    config: TableConfig,
    id: string,
  ): Promise<FlowJsonObject> {
    const result = await trx.query<FlowRow>(
      `select * from ${config.sqlName} where id = $1::uuid limit 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Flow row not found');
    }
    return camelizeRow(row);
  }

  private async exportGraphFromTransaction(
    trx: Transaction,
    id: string,
  ): Promise<FlowGraphExportDocument> {
    const graph = await this.getRowFromTransaction(trx, TABLES.graphs, id);
    const scopeId = requireString(graph.scopeId, 'graph.scopeId');

    const [nodes, edges, transitionEffects, agentRules, nodeFormRules, policySets] = await Promise.all([
      trx.query<FlowRow>('select * from flow.nodes where graph_id = $1::uuid order by sort_order, code', [id]),
      trx.query<FlowRow>(
        `
          select edge.*, from_node.code as from_node_code, to_node.code as to_node_code
          from flow.edges edge
          join flow.nodes from_node on from_node.id = edge.from_node_id
          join flow.nodes to_node on to_node.id = edge.to_node_id
          where edge.graph_id = $1::uuid
          order by edge.sort_order, edge.id
        `,
        [id],
      ),
      trx.query<FlowRow>(
        'select * from flow.transition_effects where graph_id = $1::uuid order by sort_order, id',
        [id],
      ),
      trx.query<FlowRow>(
        `
          select rule.*, node.code as node_code
          from flow.agent_rules rule
          join flow.nodes node on node.id = rule.node_id
          where node.graph_id = $1::uuid
          order by node.sort_order, rule.sort_order, rule.id
        `,
        [id],
      ),
      trx.query<FlowRow>(
        `
          select rule.*, node.code as node_code
          from flow.node_form_rules rule
          join flow.nodes node on node.id = rule.node_id
          where node.graph_id = $1::uuid
          order by node.sort_order, rule.id
        `,
        [id],
      ),
      trx.query<FlowRow>('select * from flow.policy_sets where scope_id = $1::uuid order by version, id', [
        scopeId,
      ]),
    ]);

    const policySetIds = policySets.rows
      .map((row) => row.id)
      .filter((value): value is string => typeof value === 'string');
    const policyRules = policySetIds.length === 0
      ? []
      : (await trx.query<FlowRow>(
          'select * from flow.policy_rules where policy_set_id = any($1::uuid[]) order by priority, id',
          [policySetIds],
        )).rows;

    return {
      graph,
      nodes: nodes.rows.map(camelizeRow),
      edges: edges.rows.map(camelizeRow),
      transitionEffects: transitionEffects.rows.map(camelizeRow),
      agentRules: agentRules.rows.map(camelizeRow),
      nodeFormRules: nodeFormRules.rows.map(camelizeRow),
      policySets: policySets.rows.map(camelizeRow),
      policyRules: policyRules.map(camelizeRow),
    };
  }

  private validateImport(document: FlowGraphImportDocument): void {
    const nodeCodes = new Set<string>();
    let hasStart = false;
    for (const node of document.nodes) {
      if (nodeCodes.has(node.code)) {
        throw new BadRequestException(`Duplicate node code: ${node.code}`);
      }
      nodeCodes.add(node.code);
      if (node.kind === 'start') {
        hasStart = true;
      }
    }

    if (!hasStart) {
      throw new BadRequestException('Graph import requires at least one start node');
    }

    const edgeKeys = new Set<string>();
    for (const edge of document.edges ?? []) {
      if (!nodeCodes.has(edge.fromNodeCode) || !nodeCodes.has(edge.toNodeCode)) {
        throw new BadRequestException('Graph import edge references a missing node code');
      }
      const edgeKey = `${edge.fromNodeCode}:${edge.action ?? ''}:${edge.toNodeCode}`;
      if (edgeKeys.has(edgeKey)) {
        throw new BadRequestException(`Duplicate graph edge: ${edgeKey}`);
      }
      edgeKeys.add(edgeKey);
    }
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

  private objectInput(input: unknown): FlowJsonObject {
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
      return input as FlowJsonObject;
    }
    throw new BadRequestException('Request body must be an object');
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }
}
