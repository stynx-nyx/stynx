import { Injectable } from '@nestjs/common';
import { Database, type Transaction } from '@stynx/data';
import { FlowDesignService } from './flow-design.service';
import type { FlowJsonObject } from './types';
import { parseDto, policyEvaluationSchema } from './validation';

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

      const targetColumn = dto.action ? 'action' : 'capability';
      const targetValue = dto.action ?? dto.capability;
      const rules = await trx.query<{
        id: string;
        effect: 'allow' | 'deny';
        priority: number;
        reason_code?: string | null;
        conditions: FlowJsonObject;
      }>(
        `
          select id, effect, priority, reason_code, conditions
          from flow.policy_rules
          where policy_set_id = $1::uuid
            and ${targetColumn} = $2
            and (node_code is null or node_code = $3)
            and (status_code is null or status_code = $4)
          order by priority desc, case effect when 'deny' then 0 else 1 end, id
        `,
        [policySetId, targetValue, dto.nodeCode ?? null, dto.statusCode ?? null],
      );

      for (const rule of rules.rows) {
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
    }) as Promise<FlowJsonObject>;
  }

  private async resolvePolicySetId(
    trx: Transaction,
    dto: { scopeId?: string | undefined; scopeCode?: string | undefined },
  ): Promise<string | undefined> {
    const result = await trx.query<{ id: string }>(
      `
        select ps.id
        from flow.policy_sets ps
        join flow.scopes s on s.id = ps.scope_id
        where ps.is_active
          and ($1::uuid is null or ps.scope_id = $1::uuid)
          and ($2::text is null or s.code = $2::text)
        order by ps.updated_at desc, ps.id
        limit 1
      `,
      [dto.scopeId ?? null, dto.scopeCode ?? null],
    );
    return result.rows[0]?.id;
  }

  private async conditionsMatch(
    trx: Transaction,
    conditions: FlowJsonObject | null | undefined,
    facts: FlowJsonObject,
  ): Promise<boolean> {
    const value = conditions ?? {};
    if (Object.keys(value).length === 0) {
      return true;
    }
    if (typeof value.jsonpath === 'string') {
      const result = await trx.query<{ matched: boolean }>(
        'select flow.eval_rule($1::text, $2::jsonb) as matched',
        [value.jsonpath, facts],
      );
      return result.rows[0]?.matched === true;
    }
    return Object.entries(value).every(([key, expected]) => facts[key] === expected);
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
