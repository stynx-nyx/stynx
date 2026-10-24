import { Injectable } from '@nestjs/common';
import { Database, type Transaction } from '@stynx-nyx/data';
import { FlowDesignService } from './flow-design.service.js';
import type { FlowJsonObject } from './types.js';
import { parseDto, policyEvaluationSchema } from './validation.js';
import {
  resolvePolicySetIdQuery,
  evaluatePolicyConditionQuery,
  selectActionPolicyRulesQuery,
  selectCapabilityPolicyRulesQuery,
  isPolicyRuleRow,
} from './policy-queries.repository.js';

@Injectable()
export class FlowPolicyService {
  constructor(
    private readonly design: FlowDesignService,
    private readonly db: Database,
  ) {}

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

  async evaluate(input: unknown): Promise<FlowJsonObject> {
    const dto = parseDto(policyEvaluationSchema, input);
    return this.db.tx(async (trx) => {
      const policySetId = dto.policySetId ?? await this.resolvePolicySetId(trx, dto);
      if (!policySetId) {
        return this.defaultDecision();
      }

      const targetValue = dto.action ?? dto.capability;
      const rules = await trx.runGuarded(
        dto.action ? selectActionPolicyRulesQuery : selectCapabilityPolicyRulesQuery,
        [policySetId, targetValue, dto.nodeCode ?? null, dto.statusCode ?? null],
        isPolicyRuleRow,
      );

      for (const rule of rules) {
        if (await this.conditionsMatch(trx, rule.conditions, dto.facts ?? {})) {
          return {
            allowed: rule.effect === 'allow',
            effect: rule.effect,
            reasonCode: rule.reason_code ?? null,
            matchedRuleId: rule.id,
            defaulted: false,
          };
        }
      }

      return this.defaultDecision();
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  private async resolvePolicySetId(
    trx: Transaction,
    dto: { scopeId?: string | undefined; scopeCode?: string | undefined },
  ): Promise<string | undefined> {
    const rows = await trx.run(resolvePolicySetIdQuery, [dto.scopeId ?? null, dto.scopeCode ?? null]);
    return rows[0]?.id;
  }

  private async conditionsMatch(
    trx: Transaction,
    conditions: unknown,
    facts: FlowJsonObject,
  ): Promise<boolean> {
    const value = conditions ?? {};
    if (Object.keys(value).length === 0) {
      return true;
    }
    if (typeof this.conditionJsonPath(value) === 'string') {
      const rows = await trx.run(evaluatePolicyConditionQuery, [this.conditionJsonPath(value), facts]);
      return rows[0]?.matched === true;
    }
    const entries: Array<[string, unknown]> = Object.entries(value);
    return entries.every(([key, expected]) => facts[key] === expected);
  }

  private conditionJsonPath(value: unknown): unknown {
    const boxed: unknown = Object(value);
    if ((typeof boxed === 'object' && boxed !== null) || typeof boxed === 'function') {
      return Reflect.get(boxed, 'jsonpath', value);
    }
    return undefined;
  }

  private defaultDecision(): FlowJsonObject {
    return {
      allowed: true,
      effect: 'allow',
      reasonCode: null,
      matchedRuleId: null,
      defaulted: true,
    };
  }
}
