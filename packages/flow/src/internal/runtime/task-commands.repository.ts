import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text=z.string();
const uuid=text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
// Preserve the existing DTO's opaque object contract and pg JSON serialization.
const payload=z.record(text,z.unknown());

export const completeTask=defineQuery({name:'flow.completeTask',text:sql`select flow.task_complete($1::uuid, $2::text, $3::text, $4::jsonb)`,params:z.tuple([uuid,text,text.nullable(),payload]),row:z.object({task_complete:z.literal('').nullable()}),expects:'many'});

export const assignTask=defineQuery({name:'flow.assignTask',text:sql`select flow.task_assign($1::uuid, $2::uuid, $3::text)`,params:z.tuple([uuid,uuid,text.nullable()]),row:z.object({task_assign:text}),expects:'many'});

export const unassignTask=defineQuery({name:'flow.unassignTask',text:sql`select flow.task_unassign($1::uuid, $2::text)`,params:z.tuple([uuid,text.nullable()]),row:z.object({task_unassign:text}),expects:'many'});

export const acceptTask=defineQuery({name:'flow.acceptTask',text:sql`select flow.task_accept($1::uuid, $2::text)`,params:z.tuple([uuid,text.nullable()]),row:z.object({task_accept:z.literal('').nullable()}),expects:'many'});

export const declineTask=defineQuery({name:'flow.declineTask',text:sql`select flow.task_decline($1::uuid, $2::text)`,params:z.tuple([uuid,text.nullable()]),row:z.object({task_decline:z.literal('').nullable()}),expects:'many'});

export const unacceptTask=defineQuery({name:'flow.unacceptTask',text:sql`select flow.task_unaccept($1::uuid, $2::text)`,params:z.tuple([uuid,text.nullable()]),row:z.object({task_unaccept:z.literal('').nullable()}),expects:'many'});

export const withdrawTask=defineQuery({name:'flow.withdrawTask',text:sql`select flow.task_withdraw($1::uuid, $2::text)`,params:z.tuple([uuid,text.nullable()]),row:z.object({task_withdraw:z.literal('').nullable()}),expects:'many'});
