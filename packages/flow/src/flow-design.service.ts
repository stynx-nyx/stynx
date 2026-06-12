import { BadRequestException, Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx/core';
import { Database } from '@stynx/data';
import { FlowGraphPackage } from './internal/design/graph-package';
import { FlowDesignTableStore } from './internal/design/design-table-store';
import type { FlowGraphExportDocument, FlowGraphImportDocument, FlowJsonObject } from './types';
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
  publishGraphSchema,
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

function normalizeNodeFormRule(input: FlowJsonObject): FlowJsonObject {
  if (input.gatingMode === 'any_answered') {
    return { ...input, gatingMode: 'any' };
  }
  if (input.gatingMode === 'score_threshold') {
    return { ...input, gatingMode: 'threshold' };
  }
  return input;
}

@Injectable()
export class FlowDesignService {
  private readonly tables: FlowDesignTableStore;
  private readonly graphPackage: FlowGraphPackage;

  constructor(db: Database, requestContext: RequestContext) {
    this.tables = new FlowDesignTableStore(db, requestContext);
    this.graphPackage = new FlowGraphPackage(db, requestContext, this.tables);
  }

  listScopes(): Promise<FlowJsonObject[]> {
    return this.tables.listRows('scopes');
  }

  getScope(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('scopes', id);
  }

  createScope(input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow('scopes', parseDto(createScopeSchema, input));
  }

  updateScope(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('scopes', id, parseDto(updateScopeSchema, input));
  }

  deleteScope(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('scopes', id);
  }

  listGraphs(scopeId?: string): Promise<FlowJsonObject[]> {
    return this.tables.listRows('graphs', scopeId ? { scope_id: scopeId } : {});
  }

  getGraph(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('graphs', id);
  }

  createGraph(input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow('graphs', parseDto(createGraphSchema, input));
  }

  updateGraph(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('graphs', id, parseDto(updateGraphSchema, input));
  }

  deleteGraph(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('graphs', id);
  }

  publishGraph(id: string, input: unknown = {}): Promise<FlowJsonObject> {
    return this.graphPackage.publishGraph(id, parseDto(publishGraphSchema, input));
  }

  listGraphNodes(graphId: string): Promise<FlowJsonObject[]> {
    return this.tables.listRows('nodes', { graph_id: graphId }, 'sort_order, code');
  }

  createGraphNode(graphId: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow('nodes', parseDto(createNodeSchema, { ...this.objectInput(input), graphId }));
  }

  updateNode(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('nodes', id, parseDto(updateNodeSchema, input));
  }

  getNode(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('nodes', id);
  }

  deleteNode(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('nodes', id);
  }

  listGraphEdges(graphId: string): Promise<FlowJsonObject[]> {
    return this.tables.listRows('edges', { graph_id: graphId }, 'sort_order, action NULLS FIRST');
  }

  createGraphEdge(graphId: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow('edges', parseDto(createEdgeSchema, { ...this.objectInput(input), graphId }));
  }

  updateEdge(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('edges', id, parseDto(updateEdgeSchema, input));
  }

  getEdge(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('edges', id);
  }

  deleteEdge(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('edges', id);
  }

  listNodeAgentRules(nodeId: string): Promise<FlowJsonObject[]> {
    return this.tables.listRows('agentRules', { node_id: nodeId }, 'sort_order, id');
  }

  createNodeAgentRule(nodeId: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow('agentRules', parseDto(createAgentRuleSchema, { ...this.objectInput(input), nodeId }));
  }

  updateAgentRule(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('agentRules', id, parseDto(updateAgentRuleSchema, input));
  }

  getAgentRule(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('agentRules', id);
  }

  deleteAgentRule(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('agentRules', id);
  }

  listGraphTransitionEffects(graphId: string): Promise<FlowJsonObject[]> {
    return this.tables.listRows('transitionEffects', { graph_id: graphId }, 'sort_order, id');
  }

  createGraphTransitionEffect(graphId: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow(
      'transitionEffects',
      parseDto(createTransitionEffectSchema, { ...this.objectInput(input), graphId }),
    );
  }

  updateTransitionEffect(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('transitionEffects', id, parseDto(updateTransitionEffectSchema, input));
  }

  getTransitionEffect(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('transitionEffects', id);
  }

  deleteTransitionEffect(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('transitionEffects', id);
  }

  listNodeFormRules(nodeId: string): Promise<FlowJsonObject[]> {
    return this.tables.listRows('nodeFormRules', { node_id: nodeId }, 'id');
  }

  createNodeFormRule(nodeId: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow(
      'nodeFormRules',
      normalizeNodeFormRule(parseDto(createNodeFormRuleSchema, { ...this.objectInput(input), nodeId })),
    );
  }

  updateNodeFormRule(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('nodeFormRules', id, normalizeNodeFormRule(parseDto(updateNodeFormRuleSchema, input)));
  }

  getNodeFormRule(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('nodeFormRules', id);
  }

  deleteNodeFormRule(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('nodeFormRules', id);
  }

  listPolicySets(scopeId?: string): Promise<FlowJsonObject[]> {
    return this.tables.listRows('policySets', scopeId ? { scope_id: scopeId } : {}, 'version, id');
  }

  createPolicySet(input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow('policySets', parseDto(createPolicySetSchema, input));
  }

  updatePolicySet(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('policySets', id, parseDto(updatePolicySetSchema, input));
  }

  getPolicySet(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('policySets', id);
  }

  deletePolicySet(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('policySets', id);
  }

  listPolicyRules(policySetId: string): Promise<FlowJsonObject[]> {
    return this.tables.listRows('policyRules', { policy_set_id: policySetId }, 'priority, id');
  }

  createPolicyRule(policySetId: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.createRow('policyRules', parseDto(createPolicyRuleSchema, { ...this.objectInput(input), policySetId }));
  }

  updatePolicyRule(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.tables.updateRow('policyRules', id, parseDto(updatePolicyRuleSchema, input));
  }

  getPolicyRule(id: string): Promise<FlowJsonObject> {
    return this.tables.getRow('policyRules', id);
  }

  deletePolicyRule(id: string): Promise<FlowJsonObject> {
    return this.tables.softDeleteRow('policyRules', id);
  }

  importGraph(input: unknown): Promise<FlowGraphExportDocument> {
    return this.graphPackage.importGraph(parseDto(graphImportSchema, input) as FlowGraphImportDocument);
  }

  exportGraph(id: string): Promise<FlowGraphExportDocument> {
    return this.graphPackage.exportGraph(id);
  }

  private objectInput(input: unknown): FlowJsonObject {
    if (input !== null && typeof input === 'object' && !Array.isArray(input)) {
      return input as FlowJsonObject;
    }
    throw new BadRequestException('Request body must be an object');
  }
}
