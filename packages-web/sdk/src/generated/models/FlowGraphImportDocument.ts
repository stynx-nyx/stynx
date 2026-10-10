/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowGraphImportEdge } from './FlowGraphImportEdge';
import type { FlowGraphImportNode } from './FlowGraphImportNode';
import type { FlowJsonObject } from './FlowJsonObject';
import type { JsonValue } from './JsonValue';
export type FlowGraphImportDocument = {
  agentRules?: Array<Record<string, JsonValue>>;
  edges?: Array<FlowGraphImportEdge>;
  graph: FlowJsonObject;
  nodeFormRules?: Array<Record<string, JsonValue>>;
  nodes: Array<FlowGraphImportNode>;
  transitionEffects?: Array<FlowJsonObject>;
};
