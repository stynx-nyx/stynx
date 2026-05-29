/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { FlowJsonObject } from './FlowJsonObject';
export type FlowGraphImportNode = {
    allowedActions?: Array<string>;
    code: string;
    decisionPolicy?: string;
    entryRule?: string;
    exitRule?: string;
    kind: string;
    meta?: FlowJsonObject;
    name?: string;
    quorumRatio?: string;
    slaSeconds?: number;
    sortOrder?: number;
};

