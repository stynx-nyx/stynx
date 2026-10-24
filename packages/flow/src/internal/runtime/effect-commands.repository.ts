import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text=z.string();
const uuid=text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
// Caller-owned facts retain pg's existing JSON serialization, including absent keys.
const payload=z.record(text,z.unknown());
export const signalChanged=defineQuery({name:'flow.signalChanged',text:sql`select flow.signal_changed($1::uuid, $2::text, $3::text)`,params:z.tuple([uuid,text,text]),row:z.object({signal_changed:z.literal('').nullable()}),expects:'many'});

export const recordEffectResult=defineQuery({name:'flow.recordEffectResult',text:sql`
          insert into flow.events (tenant_id, run_id, node_id, task_id, kind, actor_id, payload)
          values ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::flow.event_kind, $6::uuid, $7::jsonb)
        `,params:z.tuple([uuid,uuid,uuid.nullable(),uuid.nullable(),z.enum(['effect_succeeded','effect_failed']),uuid.nullable(),payload]),row:z.object({}),expects:'none'});

export const recordAdapterFailure=defineQuery({name:'flow.recordAdapterFailure',text:sql`
          insert into flow.events (tenant_id, run_id, kind, actor_id, payload)
          values ($1::uuid, $2::uuid, 'facts_changed', $3::uuid, $4::jsonb)
        `,params:z.tuple([uuid.nullish(),uuid,uuid.nullable(),payload]),row:z.object({}),expects:'none'});
