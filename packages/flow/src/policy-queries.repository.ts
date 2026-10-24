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
  params: z.tuple([text, facts]),
  row: z.object({ matched: z.boolean().nullish() }),
  expects: 'many',
});
