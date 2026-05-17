import { Injectable } from '@nestjs/common';
import { FlowDesignService } from './flow-design.service';
import type { FlowJsonObject } from './types';

@Injectable()
export class FlowPolicyService {
  constructor(private readonly design: FlowDesignService) {}

  listPolicySets(scopeId?: string): Promise<FlowJsonObject[]> {
    return this.design.listPolicySets(scopeId);
  }

  createPolicySet(input: unknown): Promise<FlowJsonObject> {
    return this.design.createPolicySet(input);
  }

  getPolicySet(id: string): Promise<FlowJsonObject> {
    return this.design.getPolicySet(id);
  }

  updatePolicySet(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.design.updatePolicySet(id, input);
  }

  deletePolicySet(id: string): Promise<FlowJsonObject> {
    return this.design.deletePolicySet(id);
  }

  listPolicyRules(policySetId: string): Promise<FlowJsonObject[]> {
    return this.design.listPolicyRules(policySetId);
  }

  createPolicyRule(policySetId: string, input: unknown): Promise<FlowJsonObject> {
    return this.design.createPolicyRule(policySetId, input);
  }

  getPolicyRule(id: string): Promise<FlowJsonObject> {
    return this.design.getPolicyRule(id);
  }

  updatePolicyRule(id: string, input: unknown): Promise<FlowJsonObject> {
    return this.design.updatePolicyRule(id, input);
  }

  deletePolicyRule(id: string): Promise<FlowJsonObject> {
    return this.design.deletePolicyRule(id);
  }
}
