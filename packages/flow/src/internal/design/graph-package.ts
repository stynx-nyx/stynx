import {
  isGraphPackageRow,
  publishNodesQuery,
  publishEdgesQuery,
  recordPublicationQuery,
  lockedGraphQuery,
  exportNodesQuery,
  exportEdgesQuery,
  exportTransitionEffectsQuery,
  exportAgentRulesQuery,
  exportNodeFormRulesQuery,
  exportPolicySetsQuery,
  exportPolicyRulesQuery,
} from './graph-package.repository.js';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database, Transaction } from '@stynx-nyx/data';
import type { z } from 'zod';
import type { graphImportSchema } from '../../validation.js';
import type { FlowGraphExportDocument, FlowJsonObject } from '../../types.js';
import {
  camelizeDesignRow,
  graphPublishMeta,
  jsonObject,
  requireString,
  type DesignFlowRow,
  withGraphPublishState,
  FlowDesignTableStore,
} from './design-table-store.js';

type GraphImportInput = z.output<typeof graphImportSchema>;

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
        trx.runGuarded(publishNodesQuery, [id], isGraphPackageRow),
        trx.runGuarded(publishEdgesQuery, [id], isGraphPackageRow),
      ]);
      this.validatePublishableGraph(nodes, edges);

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

      await trx.runGuarded(recordPublicationQuery,
        [id, meta, publishedBy, publishedAt],
        isGraphPackageRow,
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

  importGraph(document: GraphImportInput): Promise<FlowGraphExportDocument> {
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
    const result = await trx.runGuarded(lockedGraphQuery, [id], isGraphPackageRow);
    const row = result[0];
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
      await this.tableStore.getRowFromTransaction(trx, 'graphs', id),
    );
    const scopeId = requireString(graph.scopeId, 'graph.scopeId');

    const [nodes, edges, transitionEffects, agentRules, nodeFormRules, policySets] = await Promise.all([
      trx.runGuarded(exportNodesQuery, [id], isGraphPackageRow),
      trx.runGuarded(exportEdgesQuery, [id], isGraphPackageRow),
      trx.runGuarded(exportTransitionEffectsQuery, [id], isGraphPackageRow),
      trx.runGuarded(exportAgentRulesQuery, [id], isGraphPackageRow),
      trx.runGuarded(exportNodeFormRulesQuery, [id], isGraphPackageRow),
      trx.runGuarded(exportPolicySetsQuery, [scopeId], isGraphPackageRow),
    ]);

    const policySetIds = policySets
      .map((row) => row.id)
      .filter((value): value is string => typeof value === 'string');
    const policyRules = policySetIds.length === 0
      ? []
      : await trx.runGuarded(exportPolicyRulesQuery, [policySetIds], isGraphPackageRow);

    return {
      graph,
      nodes: nodes.map(camelizeDesignRow),
      edges: edges.map(camelizeDesignRow),
      transitionEffects: transitionEffects.map(camelizeDesignRow),
      agentRules: agentRules.map(camelizeDesignRow),
      nodeFormRules: nodeFormRules.map(camelizeDesignRow),
      policySets: policySets.map(camelizeDesignRow),
      policyRules: policyRules.map(camelizeDesignRow),
    };
  }

  private validateImport(document: GraphImportInput): void {
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

  private validatePublishableGraph(nodes: readonly DesignFlowRow[], edges: readonly DesignFlowRow[]): void {
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
