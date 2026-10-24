// Compile-only consumer of genuine emitted/public entrypoints; no runtime execution.
import {
  FlowDesignService, graphImportSchema,
  type FlowGraphImportDocument, type FlowGraphImportNode, type FlowGraphImportEdge,
} from '../../dist/flow/src/index.js';
import { FlowGraphPackage } from '../../dist/flow/src/internal/design/graph-package.js';
import {
  SOFT_DELETABLE, tenants, scopes, graphs, nodes, edges, agentRules, transitionEffects,
  nodeFormRules, policySets, policyRules, forms, questions, scores, fills, answers, waivers,
  type Transaction,
} from '@stynx-nyx/data';

declare const transaction: Transaction;
declare const facade: FlowDesignService;
declare const internal: FlowGraphPackage;
const input = graphImportSchema.parse({
  graph: { scopeId: '0190abcd-1234-7abc-89ab-000000000001', code: 'g', name: undefined },
  nodes: [{ code: 'start', kind: 'start', name: undefined }],
  edges: [{ fromNodeCode: 'start', toNodeCode: 'start', action: undefined }],
});
// Actual schema output, including optional own undefined, needs no assertion.
export const internalResult = internal.importGraph(input);
export const facadeResult = facade.importGraph(input);

export const existingNode: FlowGraphImportNode = { code: 'start', kind: 'start' };
export const existingEdge: FlowGraphImportEdge = { fromNodeCode: 'start', toNodeCode: 'start' };
export const existingDocument: FlowGraphImportDocument = {
  graph: { scopeId: 'scope', code: 'g' }, nodes: [existingNode], edges: [existingEdge],
};
export const existingPublicCall = facade.importGraph(existingDocument);
// @ts-expect-error the published exact optional node contract has not been widened
export const invalidPublicNode: FlowGraphImportNode = { code: 'start', kind: 'start', name: undefined };
// @ts-expect-error the published exact optional edge contract has not been widened
export const invalidPublicEdge: FlowGraphImportEdge = { fromNodeCode: 'start', toNodeCode: 'start', action: undefined };

export const realTableCalls = [
  transaction.softDelete(scopes, 'id'), transaction.softDelete(graphs, 'id'),
  transaction.softDelete(nodes, 'id'), transaction.softDelete(edges, 'id'),
  transaction.softDelete(agentRules, 'id'), transaction.softDelete(transitionEffects, 'id'),
  transaction.softDelete(nodeFormRules, 'id'), transaction.softDelete(policySets, 'id'),
  transaction.softDelete(policyRules, 'id'), transaction.softDelete(forms, 'id'),
  transaction.softDelete(questions, 'id'), transaction.softDelete(scores, 'id'),
  transaction.softDelete(fills, 'id'), transaction.softDelete(answers, 'id'),
  transaction.softDelete(waivers, 'id'),
];
// @ts-expect-error a real unbranded PostgreSQL table is not soft-deletable
transaction.softDelete(tenants, 'id');
const markerOnly: { readonly [SOFT_DELETABLE]: true } = { [SOFT_DELETABLE]: true };
// @ts-expect-error a marker alone is not a genuine PostgreSQL table
transaction.softDelete(markerOnly, 'id');
