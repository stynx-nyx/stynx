import { z } from 'zod';
import { defineQuery, sql } from './typed-query.js';

export const liveCommandIdentity = defineQuery({
  name: 'data.context.live-command-identity',
  text: sql`SELECT current_user,
              current_setting('app.role', true) AS role,
              current_setting('app.tenant_id', true) AS tenant_id,
              current_setting('app.actor_id', true) AS actor_id`,
  params: z.tuple([]),
  row: z.object({ current_user: z.string(), role: z.string().nullable(), tenant_id: z.string().nullable(), actor_id: z.string().nullable() }),
  expects: 'zero-or-one',
});

export const appRoleProperties = defineQuery({
  name: 'data.context.app-role-properties',
  text: sql`select current_user::text as current_user,
       session_user::text as session_user,
       c.rolsuper as current_super,
       c.rolbypassrls as current_bypassrls,
       s.rolsuper as session_super,
       s.rolbypassrls as session_bypassrls
  from pg_catalog.pg_roles c, pg_catalog.pg_roles s
 where c.rolname = current_user and s.rolname = session_user`,
  params: z.tuple([]),
  row: z.object({ current_user: z.string(), session_user: z.string(), current_super: z.boolean(), current_bypassrls: z.boolean(), session_super: z.boolean(), session_bypassrls: z.boolean() }),
  expects: 'zero-or-one',
});
