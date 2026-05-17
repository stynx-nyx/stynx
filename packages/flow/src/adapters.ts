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

  async applyEffect(input: FlowEffectInput): Promise<FlowEffectResult> {
    const adapter = this.get(input.adapterKey);
    if (!adapter) {
      throw new BadGatewayException({
        code: 'FLOW_ADAPTER_NOT_FOUND',
        adapterKey: input.adapterKey,
        operation: 'applyEffect',
      });
    }

    try {
      return await adapter.applyEffect(input);
    } catch (error) {
      throw this.wrapAdapterError(input.adapterKey, 'applyEffect', error);
    }
  }

  async canView(input: FlowAccessInput): Promise<boolean> {
    const adapter = this.get(input.adapterKey);
    if (!adapter) {
      return true;
    }

    try {
      return await adapter.canView(input);
    } catch (error) {
      throw this.wrapAdapterError(input.adapterKey, 'canView', error);
    }
  }

  async canManage(input: FlowAccessInput): Promise<boolean> {
    const adapter = this.get(input.adapterKey);
    if (!adapter) {
      return true;
    }

    try {
      return await adapter.canManage(input);
    } catch (error) {
      throw this.wrapAdapterError(input.adapterKey, 'canManage', error);
    }
  }

  async resolveAgents(input: FlowAgentResolutionInput): Promise<FlowResolvedAgent[]> {
    const adapter = this.get(input.adapterKey);
    if (!adapter?.resolveAgents) {
      return [];
    }

    try {
      return await adapter.resolveAgents(input);
    } catch (error) {
      throw this.wrapAdapterError(input.adapterKey, 'resolveAgents', error);
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
