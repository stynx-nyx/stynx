import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

export function isRuntimeReadModelRow(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const getTaskFromTransactionQuery = defineQuery({
  name: 'flow.runtime-read-model.get-task',
  text: sql`
        select t.*, n.code as node_code, n.name as node_name, n.kind
        from flow.tasks t
        join flow.nodes n on n.id = t.node_id
        where t.id = $1::uuid
        limit 1
      `,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional(), node_code: z.unknown().optional(), node_name: z.unknown().optional(), kind: z.unknown().optional() }),
  expects: 'many',
});

export const scopeCodeForIdQuery = defineQuery({
  name: 'flow.runtime-read-model.scopeCodeForId.fixed',
  text: sql`select code from flow.scopes where id = $1::uuid limit 1`,
  params: z.tuple([z.string()]),
  row: z.looseObject({ code: z.unknown().optional() }),
  expects: 'many',
});

export const scopeIdForCodeQuery = defineQuery({
  name: 'flow.runtime-read-model.scopeIdForCode.fixed',
  text: sql`select id from flow.scopes where code = $1 limit 1`,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const getRunQuery = defineQuery({
  name: 'flow.runtime-read-model.getRun.fixed',
  text: sql`select * from flow.runs where id = $1::uuid limit 1`,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const listRunNodeRunsQuery = defineQuery({
  name: 'flow.runtime-read-model.listRunNodeRuns.fixed',
  text: sql`
        select nr.*, n.code as node_code, n.name as node_name, n.kind
        from flow.node_runs nr
        join flow.nodes n on n.id = nr.node_id
        where nr.run_id = $1::uuid
        order by nr.opened_at, nr.id
      `,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const listRunTasksQuery = defineQuery({
  name: 'flow.runtime-read-model.listRunTasks.fixed',
  text: sql`
        select t.*, n.code as node_code, n.name as node_name, n.kind
        from flow.tasks t
        join flow.nodes n on n.id = t.node_id
        where t.run_id = $1::uuid
        order by t.created_at desc, t.id
      `,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const listRunEventsQuery = defineQuery({
  name: 'flow.runtime-read-model.listRunEvents.fixed',
  text: sql`
        select e.*, n.code as node_code, t.status as task_status
        from flow.events e
        left join flow.nodes n on n.id = e.node_id
        left join flow.tasks t on t.id = e.task_id
        where e.run_id = $1::uuid
        order by e.created_at desc, e.id desc
      `,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const getNodeRunQuery = defineQuery({
  name: 'flow.runtime-read-model.getNodeRun.fixed',
  text: sql`
        select nr.*, n.code as node_code, n.name as node_name, n.kind
        from flow.node_runs nr
        join flow.nodes n on n.id = nr.node_id
        where nr.id = $1::uuid
        limit 1
      `,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const taskCandidatesQuery = defineQuery({
  name: 'flow.runtime-read-model.taskCandidates.fixed',
  text: sql`
        select
          candidate.*,
          rule.params,
          t.run_id,
          t.node_id,
          r.adapter_key,
          r.target_type,
          r.target_id
        from flow.tasks t
        cross join lateral flow.resolve_agents(t.node_id, t.run_id) candidate
        left join flow.agent_rules rule on rule.id = candidate.rule_id
        join flow.runs r on r.id = t.run_id
        where t.id = $1::uuid
      `,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const roleUsersQuery = defineQuery({
  name: 'flow.runtime-read-model.listUsersForRole.withoutSearch',
  text: sql`
        select distinct u.id, u.email, u.external_subject
        from auth.users u
        join auth.memberships m on m.user_id = u.id and m.is_active
        join auth.membership_roles mr on mr.membership_id = m.id
        join auth.roles r on r.id = mr.role_id
        where r.key = $1
        
        order by u.email
        limit 50
      `,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const roleUsersSearchQuery = defineQuery({
  name: 'flow.runtime-read-model.listUsersForRole.withSearch',
  text: sql`
        select distinct u.id, u.email, u.external_subject
        from auth.users u
        join auth.memberships m on m.user_id = u.id and m.is_active
        join auth.membership_roles mr on mr.membership_id = m.id
        join auth.roles r on r.id = mr.role_id
        where r.key = $1
         and (u.email::text ilike $2 or u.external_subject ilike $2)
        order by u.email
        limit 50
      `,
  params: z.tuple([z.string(), z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});

export const getTaskUserQuery = defineQuery({
  name: 'flow.runtime-read-model.getTaskUser.fixed',
  text: sql`
        select distinct u.id, u.email, u.external_subject, u.locale
        from auth.users u
        join auth.memberships m on m.user_id = u.id and m.is_active
        where u.id = $1::uuid
        limit 1
      `,
  params: z.tuple([z.string()]),
  row: z.looseObject({ id: z.unknown().optional() }),
  expects: 'many',
});
