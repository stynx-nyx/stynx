import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database, Transaction } from '@stynx/data';
import type { FlowGraphExportDocument, FlowGraphImportDocument, FlowJsonObject } from '../../types';
import {
  camelizeDesignRow,
  graphPublishMeta,
  jsonObject,
  requireString,
  type DesignFlowRow,
  withGraphPublishState,
  FlowDesignTableStore,
} from './design-table-store';

type PublishGraphInput = {
  expectedDraftVersion?: string | undefined;
  notes?: string | undefined;
};

const GRAPH_PUBLISH_META_KEY = 'publish';

@Injectable()
export class FlowGraphPackage {
  constructor(
    private readonly db: Database,
    private readonly requestContext: RequestContext,
    private readonly tableStore: FlowDesignTableStore,
  ) {}

  publishGraph(id: string, body: PublishGraphInput): Promise<FlowJsonObject> {
    return this.db.tx(async (trx) => {
      const graph = await this.getGraphForUpdate(trx, id);
      const draftVersion = requireString(graph.version, 'graph.version');
      if (body.expectedDraftVersion && body.expectedDraftVersion !== draftVersion) {
        throw new ConflictException('Draft version does not match the current graph version');
      }

      const [nodes, edges] = await Promise.all([
        trx.query<DesignFlowRow>('select id, code, kind from flow.nodes where graph_id = $1::uuid order by sort_order, code', [id]),
        trx.query<DesignFlowRow>('select id, from_node_id, to_node_id from flow.edges where graph_id = $1::uuid', [id]),
      ]);
      this.validatePublishableGraph(nodes.rows, edges.rows);

      const existingPublish = graphPublishMeta(graph.meta);
      const publishedVersion = (existingPublish?.publishedVersion ?? 0) + 1;
      const publishedAt = new Date();
      const publishedBy = this.requestContext.actorId ?? null;
      const meta = {
        ...jsonObject(graph.meta),
        [GRAPH_PUBLISH_META_KEY]: {
          publishedVersion,
          publishedAt: publishedAt.toISOString(),
          publishedBy,
          draftVersion,
          ...(body.notes ? { notes: body.notes } : {}),
        },
      };

      await trx.query<DesignFlowRow>(
        `
          update flow.graphs
          set meta = $2::jsonb, updated_by = $3::uuid, updated_at = $4::timestamptz
          where id = $1::uuid
          returning *
        `,
        [id, meta, publishedBy, publishedAt],
      );

      return {
        graphId: id,
        status: 'published',
        draftVersion,
        publishedVersion,
        publishedAt: publishedAt.toISOString(),
        publishedBy,
        runtimeGraphRef: {
          graphId: id,
          version: publishedVersion,
        },
      };
    });
  }

  importGraph(document: FlowGraphImportDocument): Promise<FlowGraphExportDocument> {
    this.validateImport(document);

    return this.db.tx(async (trx) => {
      const graph = await this.tableStore.insertRow(trx, 'graphs', document.graph);
      const graphId = requireString(graph.id, 'graph.id');
      const nodeIds = new Map<string, string>();

      for (const node of document.nodes) {
        const row = await this.tableStore.insertRow(trx, 'nodes', { ...node, graphId });
        nodeIds.set(node.code, requireString(row.id, `node ${node.code}`));
      }

      for (const edge of document.edges ?? []) {
        await this.tableStore.insertRow(trx, 'edges', {
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
        await this.tableStore.insertRow(trx, 'transitionEffects', { ...effect, graphId });
      }

      for (const rule of document.agentRules ?? []) {
        await this.tableStore.insertRow(trx, 'agentRules', {
          ...rule,
          nodeId: nodeIds.get(rule.nodeCode),
        });
      }

      for (const rule of document.nodeFormRules ?? []) {
        await this.tableStore.insertRow(trx, 'nodeFormRules', {
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

  private async getGraphForUpdate(trx: Transaction, id: string): Promise<FlowJsonObject> {
    const result = await trx.query<DesignFlowRow>(
      'select * from flow.graphs where id = $1::uuid limit 1 for update',
      [id],
    );
    const row = result.rows[0];
    if (!row) {
      throw new NotFoundException('Flow row not found');
    }
    return camelizeDesignRow(row);
  }

  private async exportGraphFromTransaction(
    trx: Transaction,
    id: string,
  ): Promise<FlowGraphExportDocument> {
    const graph = withGraphPublishState(
      await this.tableStore.getRowFromTransaction(trx, this.tableStore.tableConfig('graphs'), id),
    );
    const scopeId = requireString(graph.scopeId, 'graph.scopeId');

    const [nodes, edges, transitionEffects, agentRules, nodeFormRules, policySets] = await Promise.all([
      trx.query<DesignFlowRow>('select * from flow.nodes where graph_id = $1::uuid order by sort_order, code', [id]),
      trx.query<DesignFlowRow>(
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
      trx.query<DesignFlowRow>(
        'select * from flow.transition_effects where graph_id = $1::uuid order by sort_order, id',
        [id],
      ),
      trx.query<DesignFlowRow>(
        `
          select rule.*, node.code as node_code
          from flow.agent_rules rule
          join flow.nodes node on node.id = rule.node_id
          where node.graph_id = $1::uuid
          order by node.sort_order, rule.sort_order, rule.id
        `,
        [id],
      ),
      trx.query<DesignFlowRow>(
        `
          select rule.*, node.code as node_code
          from flow.node_form_rules rule
          join flow.nodes node on node.id = rule.node_id
          where node.graph_id = $1::uuid
          order by node.sort_order, rule.id
        `,
        [id],
      ),
      trx.query<DesignFlowRow>('select * from flow.policy_sets where scope_id = $1::uuid order by version, id', [
        scopeId,
      ]),
    ]);

    const policySetIds = policySets.rows
      .map((row) => row.id)
      .filter((value): value is string => typeof value === 'string');
    const policyRules = policySetIds.length === 0
      ? []
      : (await trx.query<DesignFlowRow>(
          'select * from flow.policy_rules where policy_set_id = any($1::uuid[]) order by priority, id',
          [policySetIds],
        )).rows;

    return {
      graph,
      nodes: nodes.rows.map(camelizeDesignRow),
      edges: edges.rows.map(camelizeDesignRow),
      transitionEffects: transitionEffects.rows.map(camelizeDesignRow),
      agentRules: agentRules.rows.map(camelizeDesignRow),
      nodeFormRules: nodeFormRules.rows.map(camelizeDesignRow),
      policySets: policySets.rows.map(camelizeDesignRow),
      policyRules: policyRules.map(camelizeDesignRow),
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

  private validatePublishableGraph(nodes: DesignFlowRow[], edges: DesignFlowRow[]): void {
    const startNodes = nodes.filter((node) => node.kind === 'start');
    if (startNodes.length !== 1) {
      throw new BadRequestException('Graph publish requires exactly one start node');
    }
    if (!nodes.some((node) => node.kind === 'end')) {
      throw new BadRequestException('Graph publish requires at least one terminal node');
    }

    const nodeIds = new Set(nodes.map((node) => node.id).filter((value): value is string => typeof value === 'string'));
    for (const edge of edges) {
      if (typeof edge.from_node_id !== 'string' || typeof edge.to_node_id !== 'string') {
        throw new BadRequestException('Graph publish edge references a missing node');
      }
      if (!nodeIds.has(edge.from_node_id) || !nodeIds.has(edge.to_node_id)) {
        throw new BadRequestException('Graph publish edge references a missing node');
      }
    }
  }
}
