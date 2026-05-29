/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { FlowGraphImportEdge } from './FlowGraphImportEdge';
import type { FlowGraphImportNode } from './FlowGraphImportNode';
import type { FlowJsonObject } from './FlowJsonObject';
export type FlowGraphImportDocument = {
    agentRules?: Array<(FlowJsonObject & {
        nodeCode: string;
    })>;
    edges?: Array<FlowGraphImportEdge>;
    graph: FlowJsonObject;
    nodeFormRules?: Array<(FlowJsonObject & {
        nodeCode: string;
    })>;
    nodes: Array<FlowGraphImportNode>;
    transitionEffects?: Array<FlowJsonObject>;
};

