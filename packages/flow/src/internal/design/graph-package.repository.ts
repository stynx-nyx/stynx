import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import type { FlowJsonObject } from '../../types.js';

const text = z.string();
const opaque = z.unknown().optional();
const metadata = z.custom<FlowJsonObject>((value) => typeof value === 'object' && value !== null && !Array.isArray(value));

// These operation-specific envelopes reflect DesignFlowRow's opaque values.
// Existing domain guards own version, graph structure, metadata, and ID errors;
// these schemas do not claim to validate complete physical database rows.
const publishNodeRow = z.looseObject({ id: opaque, code: opaque, kind: opaque });
const publishEdgeRow = z.looseObject({ id: opaque, from_node_id: opaque, to_node_id: opaque });
// The UPDATE RETURNING objects are deliberately ignored by the caller.
const publicationResultRow = z.looseObject({});
const lockedGraphRow = z.looseObject({ version: opaque, meta: opaque });
const exportNodeRow = z.looseObject({ id: opaque });
const exportEdgeRow = z.looseObject({ from_node_code: opaque, to_node_code: opaque });
const exportTransitionEffectRow = z.looseObject({ id: opaque });
const exportAgentRuleRow = z.looseObject({ node_code: opaque });
const exportNodeFormRuleRow = z.looseObject({ node_code: opaque });
const exportPolicySetRow = z.looseObject({ id: opaque });
const exportPolicyRuleRow = z.looseObject({ id: opaque });

export const publishNodesQuery = defineQuery({
  name: 'flow.graph-package.publish-nodes',
  text: sql`select id, code, kind from flow.nodes where graph_id = $1::uuid order by sort_order, code`,
  params: z.tuple([text]),
  row: publishNodeRow,
  expects: 'many',
});

export const publishEdgesQuery = defineQuery({
  name: 'flow.graph-package.publish-edges',
  text: sql`select id, from_node_id, to_node_id from flow.edges where graph_id = $1::uuid`,
  params: z.tuple([text]),
  row: publishEdgeRow,
  expects: 'many',
});

export const recordPublicationQuery = defineQuery({
  name: 'flow.graph-package.record-publication',
  text: sql`
          update flow.graphs
          set meta = $2::jsonb, updated_by = $3::uuid, updated_at = $4::timestamptz
          where id = $1::uuid
          returning *
        `,
  params: z.tuple([text, metadata, text.nullable(), z.instanceof(Date)]),
  row: publicationResultRow,
  expects: 'many',
});

export const lockedGraphQuery = defineQuery({
  name: 'flow.graph-package.locked-graph',
  text: sql`select * from flow.graphs where id = $1::uuid limit 1 for update`,
  params: z.tuple([text]),
  row: lockedGraphRow,
  expects: 'many',
});

export const exportNodesQuery = defineQuery({
  name: 'flow.graph-package.export-nodes',
  text: sql`select * from flow.nodes where graph_id = $1::uuid order by sort_order, code`,
  params: z.tuple([text]),
  row: exportNodeRow,
  expects: 'many',
});

export const exportEdgesQuery = defineQuery({
  name: 'flow.graph-package.export-edges',
  text: sql`
          select edge.*, from_node.code as from_node_code, to_node.code as to_node_code
          from flow.edges edge
          join flow.nodes from_node on from_node.id = edge.from_node_id
          join flow.nodes to_node on to_node.id = edge.to_node_id
          where edge.graph_id = $1::uuid
          order by edge.sort_order, edge.id
        `,
  params: z.tuple([text]),
  row: exportEdgeRow,
  expects: 'many',
});

export const exportTransitionEffectsQuery = defineQuery({
  name: 'flow.graph-package.export-transition-effects',
  text: sql`select * from flow.transition_effects where graph_id = $1::uuid order by sort_order, id`,
  params: z.tuple([text]),
  row: exportTransitionEffectRow,
  expects: 'many',
});

export const exportAgentRulesQuery = defineQuery({
  name: 'flow.graph-package.export-agent-rules',
  text: sql`
          select rule.*, node.code as node_code
          from flow.agent_rules rule
          join flow.nodes node on node.id = rule.node_id
          where node.graph_id = $1::uuid
          order by node.sort_order, rule.sort_order, rule.id
        `,
  params: z.tuple([text]),
  row: exportAgentRuleRow,
  expects: 'many',
});

export const exportNodeFormRulesQuery = defineQuery({
  name: 'flow.graph-package.export-node-form-rules',
  text: sql`
          select rule.*, node.code as node_code
          from flow.node_form_rules rule
          join flow.nodes node on node.id = rule.node_id
          where node.graph_id = $1::uuid
          order by node.sort_order, rule.id
        `,
  params: z.tuple([text]),
  row: exportNodeFormRuleRow,
  expects: 'many',
});

export const exportPolicySetsQuery = defineQuery({
  name: 'flow.graph-package.export-policy-sets',
  text: sql`select * from flow.policy_sets where scope_id = $1::uuid order by version, id`,
  params: z.tuple([text]),
  row: exportPolicySetRow,
  expects: 'many',
});

export const exportPolicyRulesQuery = defineQuery({
  name: 'flow.graph-package.export-policy-rules',
  text: sql`select * from flow.policy_rules where policy_set_id = any($1::uuid[]) order by priority, id`,
  params: z.tuple([z.array(text)]),
  row: exportPolicyRuleRow,
  expects: 'many',
});

export function isGraphPackageRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
