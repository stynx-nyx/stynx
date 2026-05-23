export type FlagPrimitive = boolean | string | number;

export type FlagValue = FlagPrimitive | Record<string, FlagPrimitive>;

export interface FlagContext {
  tenantId?: string;
  environment?: string;
  actorId?: string;
  attributes?: Record<string, string>;
}

export interface FlagDefinition {
  default: FlagValue;
  environments?: Record<string, FlagValue>;
  tenants?: Record<string, FlagValue>;
  description?: string;
  owner?: string;
}

export interface FlagSet {
  flags: Record<string, FlagDefinition>;
}

export interface FlagEvaluation {
  flag: string;
  value: FlagValue;
  source: 'tenant' | 'environment' | 'global' | 'fallback';
  context: FlagContext;
}

export interface FeatureFlagProvider {
  evaluate(flag: string, context: FlagContext, fallback: FlagValue): Promise<FlagEvaluation>;
}
