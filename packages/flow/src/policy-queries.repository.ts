import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import type { FlowJsonObject } from './types.js';

const text = z.string();
// Facts remain opaque, including nested extension values, and keep their identity.
const facts = z.custom<FlowJsonObject>((value) => typeof value === 'object' && value !== null && !Array.isArray(value));

export const resolvePolicySetIdQuery = defineQuery({
  name: 'flow.policy.resolve-policy-set-id',
  text: sql`
        select ps.id
        from flow.policy_sets ps
        join flow.scopes s on s.id = ps.scope_id
        where ps.is_active
          and ($1::uuid is null or ps.scope_id = $1::uuid)
          and ($2::text is null or s.code = $2::text)
        order by ps.updated_at desc, ps.id
        limit 1
      `,
  params: z.tuple([text.nullable(), text.nullable()]),
  row: z.object({ id: text.optional() }),
  expects: 'many',
});

export const evaluatePolicyConditionQuery = defineQuery({
  name: 'flow.policy.evaluate-condition',
  text: sql`select flow.eval_rule($1::text, $2::jsonb) as matched`,
  params: z.tuple([z.unknown().pipe(text), facts]),
  row: z.object({ matched: z.boolean().nullish() }),
  expects: 'many',
});

// Conditions retain their native scalar, array, and opaque object semantics.
const policyRuleRow = z.object({
  id: text,
  effect: z.enum(['allow', 'deny']),
  priority: z.number().int(),
  reason_code: text.nullish(),
  conditions: z.unknown().optional(),
});
const policyRuleParams = z.tuple([text, z.unknown().pipe(text), text.nullable(), text.nullable()]);

export const selectActionPolicyRulesQuery = defineQuery({
  name: 'flow.policy.select-action-rules',
  text: sql`
          select id, effect, priority, reason_code, conditions
          from flow.policy_rules
          where policy_set_id = $1::uuid
            and action = $2
            and (node_code is null or node_code = $3)
            and (status_code is null or status_code = $4)
          order by priority desc, case effect when 'deny' then 0 else 1 end, id
        `,
  params: policyRuleParams,
  row: policyRuleRow,
  expects: 'many',
});

export const selectCapabilityPolicyRulesQuery = defineQuery({
  name: 'flow.policy.select-capability-rules',
  text: sql`
          select id, effect, priority, reason_code, conditions
          from flow.policy_rules
          where policy_set_id = $1::uuid
            and capability = $2
            and (node_code is null or node_code = $3)
            and (status_code is null or status_code = $4)
          order by priority desc, case effect when 'deny' then 0 else 1 end, id
        `,
  params: policyRuleParams,
  row: policyRuleRow,
  expects: 'many',
});

export function isPolicyRuleRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
