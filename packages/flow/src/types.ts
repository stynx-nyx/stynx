export type FlowJsonObject = Record<string, unknown>;

export interface FlowGraphImportNode {
  code: string;
  name?: string;
  kind: string;
  decisionPolicy?: string;
  quorumRatio?: string;
  allowedActions?: string[];
  slaSeconds?: number;
  entryRule?: string;
  exitRule?: string;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface FlowGraphImportEdge {
  fromNodeCode: string;
  toNodeCode: string;
  action?: string;
  rule?: string;
  spawn?: boolean;
  sortOrder?: number;
  meta?: FlowJsonObject;
}

export interface FlowGraphImportDocument {
  graph: FlowJsonObject;
  nodes: FlowGraphImportNode[];
  edges?: FlowGraphImportEdge[];
  transitionEffects?: FlowJsonObject[];
  agentRules?: Array<FlowJsonObject & { nodeCode: string }>;
  nodeFormRules?: Array<FlowJsonObject & { nodeCode: string }>;
}

export interface FlowGraphExportDocument {
  graph: FlowJsonObject;
  nodes: FlowJsonObject[];
  edges: FlowJsonObject[];
  transitionEffects: FlowJsonObject[];
  agentRules: FlowJsonObject[];
  nodeFormRules: FlowJsonObject[];
  policySets: FlowJsonObject[];
  policyRules: FlowJsonObject[];
}

export interface FlowDesignListOptions {
  scopeId?: string;
  graphId?: string;
  nodeId?: string;
  policySetId?: string;
}
