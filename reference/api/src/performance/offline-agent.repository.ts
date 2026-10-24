import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import { uuid } from '../query-schemas.js';

export const offlineAgentRoleQuery = defineQuery({
  name: 'reference.offline.agent-role', text: sql`select current_user::text as role`,
  params: z.tuple([]), row: z.object({ role: z.string() }), expects: 'one',
});
export const insertOfflineAgentBindingQuery = defineQuery({
  name: 'reference.offline.agent-binding-insert',
  text: sql`insert into core.config(key,tenant_id,value) values($1,$2,$3::jsonb)
          on conflict(key) do nothing`,
  params: z.tuple([z.string(), uuid, z.string()]), row: z.object({}), expects: 'none',
});
export const offlineAgentStoredBindingQuery = defineQuery({
  name: 'reference.offline.agent-binding-stored',
  text: sql`select value, tenant_id::text from core.config where key=$1`,
  // The binding verifier checks descriptors, prototypes and MAC on the original opaque value.
  params: z.tuple([z.string()]), row: z.object({ value: z.unknown(), tenant_id: uuid }),
  expects: 'zero-or-one',
});
export const beginOfflineAgentReadQuery = defineQuery({
  name: 'reference.offline.agent-begin-read', text: sql`begin read only`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});
export const setOfflineAgentScopeQuery = defineQuery({
  name: 'reference.offline.agent-scope',
  text: sql`select set_config('app.tenant_id',$1,true),set_config('app.actor_id',$2,true),set_config('app.role','app',true)`,
  params: z.tuple([uuid, uuid]), row: z.object({ set_config: z.string() }), expects: 'one',
});
export const resolveOfflineAgentBindingQuery = defineQuery({
  name: 'reference.offline.agent-binding-resolve',
  text: sql`select value, tenant_id::text, current_user::text as role,
          current_setting('app.tenant_id') as tenant,current_setting('app.actor_id') as actor,
          current_setting('transaction_read_only') as readonly,current_setting('app.role') as application_role
          from core.config where key=$1 and tenant_id=$2`,
  params: z.tuple([z.string(), uuid]),
  row: z.object({
    value: z.unknown(), tenant_id: uuid, role: z.string(), tenant: z.string(), actor: z.string(),
    readonly: z.string(), application_role: z.string(),
  }),
  expects: 'zero-or-one',
});
export const commitOfflineAgentReadQuery = defineQuery({
  name: 'reference.offline.agent-commit-read', text: sql`commit`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});
