import { BadGatewayException, Inject, Injectable, Optional } from '@nestjs/common';
import { FLOW_DOMAIN_ADAPTERS } from './tokens';
import type { FlowJsonObject } from './types';

export interface FlowFactsInput {
  tenantId: string;
  adapterKey: string;
  targetType: string;
  targetId: string;
  runId?: string;
  signalKey?: string;
  payload?: FlowJsonObject;
}

export interface FlowEffectInput extends FlowFactsInput {
  effectKey: string;
  nodeCode?: string;
  action?: string;
}

export interface FlowEffectResult {
  ok: boolean;
  payload?: FlowJsonObject;
}

export interface FlowAccessInput extends FlowFactsInput {
  actorId?: string;
}

export interface FlowAgentResolutionInput extends FlowFactsInput {
  nodeId: string;
  ruleId: string;
  resolverKey: string;
  params?: FlowJsonObject;
}

export interface FlowResolvedAgent {
  type: 'user' | 'permission' | 'resolver';
  id: string;
  label?: string;
}

export interface FlowDomainAdapter {
  readonly key: string;
  buildFacts(input: FlowFactsInput): Promise<FlowJsonObject>;
  applyEffect(input: FlowEffectInput): Promise<FlowEffectResult>;
  canView(input: FlowAccessInput): Promise<boolean>;
  canManage(input: FlowAccessInput): Promise<boolean>;
  resolveAgents?(input: FlowAgentResolutionInput): Promise<FlowResolvedAgent[]>;
}

@Injectable()
export class FlowAdapterRegistry {
  private readonly adapters = new Map<string, FlowDomainAdapter>();

  constructor(
    @Optional()
    @Inject(FLOW_DOMAIN_ADAPTERS)
    adapters: FlowDomainAdapter[] | undefined,
  ) {
    for (const adapter of adapters ?? []) {
      this.adapters.set(adapter.key, adapter);
    }
  }

  get(key: string): FlowDomainAdapter | undefined {
    return this.adapters.get(key);
  }

  async buildFacts(input: FlowFactsInput): Promise<FlowJsonObject> {
    const adapter = this.get(input.adapterKey);
    if (!adapter) {
      return {};
    }

    try {
      return await adapter.buildFacts(input);
    } catch (error) {
      throw this.wrapAdapterError(input.adapterKey, 'buildFacts', error);
    }
  }

  private wrapAdapterError(adapterKey: string, operation: string, error: unknown): BadGatewayException {
    const message = error instanceof Error ? error.message : String(error);
    return new BadGatewayException({
      code: 'FLOW_ADAPTER_ERROR',
      adapterKey,
      operation,
      message,
    });
  }
}
