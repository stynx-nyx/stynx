import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text=z.string();
const uuid=text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);

export const readAllowedTaskAction=defineQuery({name:'flow.readAllowedTaskAction',text:sql`
          select $2::text = any(t.allowed_actions) as allowed
          from flow.tasks t
          where t.id = $1::uuid
          limit 1
        `,params:z.tuple([uuid,text]),row:z.object({allowed:z.boolean()}),expects:'many'});

export const readTaskAccess=defineQuery({name:'flow.readTaskAccess',text:sql`
          select
            t.assignee_user_id as assignee_user_id,
            r.adapter_key,
            r.target_type,
            r.target_id,
            exists (
              select 1
              from flow.resolve_agents(t.node_id, t.run_id) candidate
              where candidate.agent_type = 'user'
                and candidate.agent_id = $2::text
            ) as is_user_candidate
          from flow.tasks t
          join flow.runs r on r.id = t.run_id
          where t.id = $1::uuid
          limit 1
        `,params:z.tuple([uuid,text]),row:z.looseObject({assignee_user_id:uuid.nullable(),adapter_key:text,target_type:text,target_id:text,is_user_candidate:z.boolean()}),expects:'many'});

export const readPendingEffects=defineQuery({name:'flow.readPendingEffects',text:sql`
          select
            e.id as event_id,
            e.run_id,
            e.node_id,
            e.task_id,
            e.payload,
            r.adapter_key,
            r.target_type,
            r.target_id,
            n.code as node_code,
            t.decided_action as action
          from flow.events e
          join flow.runs r on r.id = e.run_id
          left join flow.nodes n on n.id = e.node_id
          left join flow.tasks t on t.id = e.task_id
          where e.kind = 'effect_requested'
            and ($1::uuid is null or e.run_id = $1::uuid)
            and ($2::uuid is null or e.id = $2::uuid)
            and not exists (
              select 1
              from flow.events terminal
              where terminal.run_id = e.run_id
                and terminal.kind in ('effect_succeeded', 'effect_failed')
                and terminal.payload ->> 'effectEventId' = e.id::text
            )
          order by e.created_at, e.id
          limit $3
        `,params:z.tuple([uuid.nullable(),uuid.nullable(),z.number().int()]),row:z.looseObject({event_id:uuid,run_id:uuid,node_id:uuid.nullable(),task_id:uuid.nullable(),payload:z.json(),adapter_key:text,target_type:text,target_id:text,node_code:text.nullable(),action:text.nullable()}),expects:'many'});

export const ensureFlowRun=defineQuery({name:'flow.ensureFlowRun',text:sql`
          select flow.run_ensure(
            $1::text,
            $2::text,
            $3::text,
            $4::text,
            $5::text,
            $6::text
          ) as run_id
        `,params:z.tuple([text,text,text,text.nullable(),text,text]),row:z.object({run_id:uuid.nullish()}),expects:'many'});
