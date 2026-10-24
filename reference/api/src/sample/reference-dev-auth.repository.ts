import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import { uuid } from '../query-schemas.js';

export const assignMembershipRole = defineQuery({
  name: 'reference.dev-auth.assignMembershipRole',
  text: sql`
            insert into auth.membership_roles (membership_id, role_id)
            values ($1::uuid, $2::uuid)
            on conflict do nothing
          `,
  params: z.tuple([uuid, uuid]),
  row: z.object({}),
  expects: 'none',
});

export const ensureTenant = defineQuery({
  name: 'reference.dev-auth.ensureTenant',
  text: sql`
        insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
        values ($1::uuid, $2, $3, 'active', true, clock_timestamp(), clock_timestamp())
        on conflict (id)
        do update set
          slug = excluded.slug,
          name = excluded.name,
          state = 'active',
          is_active = true,
          archived_at = null,
          suspended_reason = null,
          updated_at = clock_timestamp()
      `,
  params: z.tuple([uuid, z.string(), z.string()]),
  row: z.object({}),
  expects: 'none',
});

export const ensureTenantSettings = defineQuery({
  name: 'reference.dev-auth.ensureTenantSettings',
  text: sql`
        insert into tenancy.tenant_settings (tenant_id, locale, timezone, settings, updated_at)
        values ($1::uuid, 'en-US', 'UTC', '{}'::jsonb, clock_timestamp())
        on conflict (tenant_id)
        do update set updated_at = clock_timestamp()
      `,
  params: z.tuple([uuid]),
  row: z.object({}),
  expects: 'none',
});

export const findUser = defineQuery({
  name: 'reference.dev-auth.findUser',
  text: sql`select id::text as id from auth.users where email = $1::citext limit 1`,
  params: z.tuple([z.string()]),
  row: z.object({ id: uuid }),
  expects: 'zero-or-one',
});

export const updateUser = defineQuery({
  name: 'reference.dev-auth.updateUser',
  text: sql`
          update auth.users
             set external_subject = $2,
                 updated_at = clock_timestamp()
           where id = $1::uuid
        `,
  params: z.tuple([uuid, z.string()]),
  row: z.object({}),
  expects: 'none',
});

export const insertUser = defineQuery({
  name: 'reference.dev-auth.insertUser',
  text: sql`
        insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
        values (gen_random_uuid(), $1::citext, $2, 'en-US', clock_timestamp(), clock_timestamp())
        returning id::text as id
      `,
  params: z.tuple([z.string(), z.string()]),
  row: z.object({ id: uuid }),
  expects: 'zero-or-one',
});

export const findMembership = defineQuery({
  name: 'reference.dev-auth.findMembership',
  text: sql`
        select id::text as id
          from auth.memberships
         where tenant_id = $1::uuid
           and user_id = $2::uuid
         limit 1
      `,
  params: z.tuple([uuid, uuid]),
  row: z.object({ id: uuid }),
  expects: 'zero-or-one',
});

export const reactivateMembership = defineQuery({
  name: 'reference.dev-auth.reactivateMembership',
  text: sql`
          update auth.memberships
             set is_active = true
           where id = $1::uuid
        `,
  params: z.tuple([uuid]),
  row: z.object({}),
  expects: 'none',
});

export const insertMembership = defineQuery({
  name: 'reference.dev-auth.insertMembership',
  text: sql`
        insert into auth.memberships (id, tenant_id, user_id, effective_hash, effective_hash_generation, is_active, created_at)
        values (gen_random_uuid(), $1::uuid, $2::uuid, null, 0, true, clock_timestamp())
        returning id::text as id
      `,
  params: z.tuple([uuid, uuid]),
  row: z.object({ id: uuid }),
  expects: 'zero-or-one',
});

export const ensureAdminRole = defineQuery({
  name: 'reference.dev-auth.ensureAdminRole',
  text: sql`
        insert into auth.roles (id, tenant_id, key, name, created_at)
        values (gen_random_uuid(), $1::uuid, 'admin', 'Admin', clock_timestamp())
        on conflict (tenant_id, key)
        do update set name = excluded.name
      `,
  params: z.tuple([uuid]),
  row: z.object({}),
  expects: 'none',
});

export const findAdminRole = defineQuery({
  name: 'reference.dev-auth.findAdminRole',
  text: sql`
        select id::text as id
          from auth.roles
         where tenant_id = $1::uuid
           and key = 'admin'
         limit 1
      `,
  params: z.tuple([uuid]),
  row: z.object({ id: uuid }),
  expects: 'zero-or-one',
});

export const grantAdminRolePermissions = defineQuery({
  name: 'reference.dev-auth.grantAdminRolePermissions',
  text: sql`
        insert into auth.role_perms (role_id, perm_id)
        select $1::uuid, perm.id
         from auth.perms perm
         where (perm.key like 'sample:%' or perm.key like 'flow:%')
           and (perm.key not like '%:hard-delete' or perm.key = 'sample:document:hard-delete')
        on conflict do nothing
      `,
  params: z.tuple([uuid]),
  row: z.object({}),
  expects: 'none',
});
