import { defineQuery, sql, type Transaction } from '@stynx-nyx/data';
import { z } from 'zod';
import type { DesignTableKey } from './design-table-store.js';

const selectedText = z.unknown().pipe(z.string());
// Opaque wildcard rows retain their own keys and original nested references.
const opaqueRow = z.object({});
function isDesignReadRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const listscopes = defineQuery({
  name: 'flow.design.list.scopes',
  text: sql`select * from flow.scopes order by created_at DESC`,
  params: z.tuple([]),
  row: opaqueRow,
  expects: 'many',
});

const getscopes = defineQuery({
  name: 'flow.design.get.scopes',
  text: sql`select * from flow.scopes where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const listgraphs = defineQuery({
  name: 'flow.design.list.graphs',
  text: sql`select * from flow.graphs order by created_at DESC`,
  params: z.tuple([]),
  row: opaqueRow,
  expects: 'many',
});

const listgraphsFiltered = defineQuery({
  name: 'flow.design.list.graphsFiltered',
  text: sql`select * from flow.graphs where scope_id = $1::uuid order by created_at DESC`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const getgraphs = defineQuery({
  name: 'flow.design.get.graphs',
  text: sql`select * from flow.graphs where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const listnodesFiltered = defineQuery({
  name: 'flow.design.list.nodesFiltered',
  text: sql`select * from flow.nodes where graph_id = $1::uuid order by sort_order, code`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const getnodes = defineQuery({
  name: 'flow.design.get.nodes',
  text: sql`select * from flow.nodes where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const listedgesFiltered = defineQuery({
  name: 'flow.design.list.edgesFiltered',
  text: sql`select * from flow.edges where graph_id = $1::uuid order by sort_order, action NULLS FIRST`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const getedges = defineQuery({
  name: 'flow.design.get.edges',
  text: sql`select * from flow.edges where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const listagentRulesFiltered = defineQuery({
  name: 'flow.design.list.agentRulesFiltered',
  text: sql`select * from flow.agent_rules where node_id = $1::uuid order by sort_order, id`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const getagentRules = defineQuery({
  name: 'flow.design.get.agentRules',
  text: sql`select * from flow.agent_rules where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const listtransitionEffectsFiltered = defineQuery({
  name: 'flow.design.list.transitionEffectsFiltered',
  text: sql`select * from flow.transition_effects where graph_id = $1::uuid order by sort_order, id`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const gettransitionEffects = defineQuery({
  name: 'flow.design.get.transitionEffects',
  text: sql`select * from flow.transition_effects where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const listnodeFormRulesFiltered = defineQuery({
  name: 'flow.design.list.nodeFormRulesFiltered',
  text: sql`select * from flow.node_form_rules where node_id = $1::uuid order by id`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const getnodeFormRules = defineQuery({
  name: 'flow.design.get.nodeFormRules',
  text: sql`select * from flow.node_form_rules where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const listpolicySets = defineQuery({
  name: 'flow.design.list.policySets',
  text: sql`select * from flow.policy_sets order by version, id`,
  params: z.tuple([]),
  row: opaqueRow,
  expects: 'many',
});

const listpolicySetsFiltered = defineQuery({
  name: 'flow.design.list.policySetsFiltered',
  text: sql`select * from flow.policy_sets where scope_id = $1::uuid order by version, id`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const getpolicySets = defineQuery({
  name: 'flow.design.get.policySets',
  text: sql`select * from flow.policy_sets where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const listpolicyRulesFiltered = defineQuery({
  name: 'flow.design.list.policyRulesFiltered',
  text: sql`select * from flow.policy_rules where policy_set_id = $1::uuid order by priority, id`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

const getpolicyRules = defineQuery({
  name: 'flow.design.get.policyRules',
  text: sql`select * from flow.policy_rules where id = $1::uuid limit 1`,
  params: z.tuple([selectedText]),
  row: opaqueRow,
  expects: 'many',
});

export function executeDesignList(trx: Transaction, key: DesignTableKey, filterId?: string) {
  switch (key) {
    case 'scopes':
      return trx.runGuarded(listscopes, [], isDesignReadRow);
    case 'graphs':
      return filterId === undefined
        ? trx.runGuarded(listgraphs, [], isDesignReadRow)
        : trx.runGuarded(listgraphsFiltered, [filterId], isDesignReadRow);
    case 'nodes':
      return trx.runGuarded(listnodesFiltered, [filterId], isDesignReadRow);
    case 'edges':
      return trx.runGuarded(listedgesFiltered, [filterId], isDesignReadRow);
    case 'agentRules':
      return trx.runGuarded(listagentRulesFiltered, [filterId], isDesignReadRow);
    case 'transitionEffects':
      return trx.runGuarded(listtransitionEffectsFiltered, [filterId], isDesignReadRow);
    case 'nodeFormRules':
      return trx.runGuarded(listnodeFormRulesFiltered, [filterId], isDesignReadRow);
    case 'policySets':
      return filterId === undefined
        ? trx.runGuarded(listpolicySets, [], isDesignReadRow)
        : trx.runGuarded(listpolicySetsFiltered, [filterId], isDesignReadRow);
    case 'policyRules':
      return trx.runGuarded(listpolicyRulesFiltered, [filterId], isDesignReadRow);
  }
}

export function executeDesignGet(trx: Transaction, key: DesignTableKey, id: string) {
  switch (key) {
    case 'scopes':
      return trx.runGuarded(getscopes, [id], isDesignReadRow);
    case 'graphs':
      return trx.runGuarded(getgraphs, [id], isDesignReadRow);
    case 'nodes':
      return trx.runGuarded(getnodes, [id], isDesignReadRow);
    case 'edges':
      return trx.runGuarded(getedges, [id], isDesignReadRow);
    case 'agentRules':
      return trx.runGuarded(getagentRules, [id], isDesignReadRow);
    case 'transitionEffects':
      return trx.runGuarded(gettransitionEffects, [id], isDesignReadRow);
    case 'nodeFormRules':
      return trx.runGuarded(getnodeFormRules, [id], isDesignReadRow);
    case 'policySets':
      return trx.runGuarded(getpolicySets, [id], isDesignReadRow);
    case 'policyRules':
      return trx.runGuarded(getpolicyRules, [id], isDesignReadRow);
  }
}
