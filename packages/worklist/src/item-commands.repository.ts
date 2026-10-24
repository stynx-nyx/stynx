import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const voidValue = text.nullable();
const claimRow = z.object({ item_id: uuid.nullable() });

export const enqueueWorkItem = defineQuery({
 name: 'worklist.enqueueWorkItem', text: sql`select worklist.item_enqueue(
             $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb
           ) as item_id`,
 params: z.tuple([text, text, text, z.number().nullable(), timestamp.nullable(), text.nullable(), z.number().nullable(), text.nullable(), text, text]), row: z.object({ item_id: uuid }), expects: 'many',
});

export const claimNextWorkItem = defineQuery({
 name: 'worklist.claimNextWorkItem', text: sql`select worklist.item_claim_next($1, $2) as item_id`,
 params: z.tuple([uuid, uuid.nullable()]), row: claimRow, expects: 'many',
});

export const assignNextWorkItem = defineQuery({
 name: 'worklist.assignNextWorkItem', text: sql`select worklist.assign_next($1) as item_id`,
 params: z.tuple([uuid]), row: claimRow, expects: 'many',
});

export const assignSelectedWorkItem = defineQuery({
 name: 'worklist.assignSelectedWorkItem', text: sql`select worklist.item_assign_next($1, $2, $3) as item_id`,
 params: z.tuple([uuid, uuid, text]), row: claimRow, expects: 'many',
});

export const claimWorkItem = defineQuery({
 name: 'worklist.claimWorkItem', text: sql`select worklist.item_claim($1, $2)`,
 params: z.tuple([uuid, uuid.nullable()]), row: z.object({ item_claim: voidValue }), expects: 'many',
});

export const releaseWorkItem = defineQuery({
 name: 'worklist.releaseWorkItem', text: sql`select worklist.item_release($1, $2, false)`,
 params: z.tuple([uuid, text.nullable()]), row: z.object({ item_release: voidValue }), expects: 'many',
});

export const completeWorkItem = defineQuery({
 name: 'worklist.completeWorkItem', text: sql`select worklist.item_complete($1, $2, $3::jsonb, false)`,
 params: z.tuple([uuid, text.nullable(), text]), row: z.object({ item_complete: voidValue }), expects: 'many',
});

export const cancelWorkItem = defineQuery({
 name: 'worklist.cancelWorkItem', text: sql`select worklist.item_cancel($1, $2)`,
 params: z.tuple([uuid, text]), row: z.object({ item_cancel: voidValue }), expects: 'many',
});

export const reassignWorkItem = defineQuery({
 name: 'worklist.reassignWorkItem', text: sql`select worklist.item_reassign($1, $2, $3, false)`,
 params: z.tuple([uuid, uuid, text]), row: z.object({ item_reassign: voidValue }), expects: 'many',
});

export const forceReleaseWorkItem = defineQuery({
 name: 'worklist.forceReleaseWorkItem', text: sql`select worklist.item_release($1, $2, true)`,
 params: z.tuple([uuid, text]), row: z.object({ item_release: voidValue }), expects: 'many',
});

export const forceCompleteWorkItem = defineQuery({
 name: 'worklist.forceCompleteWorkItem', text: sql`select worklist.item_complete($1, $2, $3::jsonb, true)`,
 params: z.tuple([uuid, text, text]), row: z.object({ item_complete: voidValue }), expects: 'many',
});

export const forceReassignWorkItem = defineQuery({
 name: 'worklist.forceReassignWorkItem', text: sql`select worklist.item_reassign($1, $2, $3, true)`,
 params: z.tuple([uuid, uuid, text]), row: z.object({ item_reassign: voidValue }), expects: 'many',
});

export const countItemEvents = defineQuery({
 name: 'worklist.countItemEvents', text: sql`select count(*)::text as total from worklist.item_events where item_id = $1`,
 params: z.tuple([uuid]), row: z.object({ total: text }), expects: 'many',
});

