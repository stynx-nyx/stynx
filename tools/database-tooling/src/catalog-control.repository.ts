import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

export const catalogSetOwner = defineQuery({
  name: 'tooling.catalog.set-owner', text: sql`set role stynx_owner`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});
export const catalogBegin = defineQuery({
  name: 'tooling.catalog.begin', text: sql`begin`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});
export const catalogCommit = defineQuery({
  name: 'tooling.catalog.commit', text: sql`commit`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});
export const catalogRollback = defineQuery({
  name: 'tooling.catalog.rollback', text: sql`rollback`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});
export const terminateTemplateConnections = defineQuery({
  name: 'tooling.integration-template.terminate-connections',
  text: sql`select pg_terminate_backend(pid) from pg_stat_activity
        where datname = $1 and pid <> pg_backend_pid()`,
  params: z.tuple([z.string().optional()]),
  row: z.object({ pg_terminate_backend: z.boolean() }),
  expects: 'many',
});
