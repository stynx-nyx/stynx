import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const idRow = z.object({ id: uuid });
const keyRow = z.object({ key: text });

export const directRoleMemberships = defineQuery({
 name: 'auth.directRoleMemberships', text: sql`
        select distinct membership_id as id
        from auth.membership_roles
        where role_id = any($1::uuid[])
      `,
 params: z.tuple([z.array(uuid)]), row: idRow, expects: 'many',
});

export const groupRoleMemberships = defineQuery({
 name: 'auth.groupRoleMemberships', text: sql`
        select distinct gm.membership_id as id
        from auth.group_roles gr
        join auth.group_memberships gm on gm.group_id = gr.group_id
        where gr.role_id = any($1::uuid[])
      `,
 params: z.tuple([z.array(uuid)]), row: idRow, expects: 'many',
});

export const membershipsForGroups = defineQuery({
 name: 'auth.membershipsForGroups', text: sql`
        select distinct membership_id as id
        from auth.group_memberships
        where group_id = any($1::uuid[])
      `,
 params: z.tuple([z.array(uuid)]), row: idRow, expects: 'many',
});

export const platformRoleMemberships = defineQuery({
 name: 'auth.platformRoleMemberships', text: sql`
        select distinct membership.id
        from auth.memberships membership
        join auth.membership_roles membership_role on membership_role.membership_id = membership.id
        join auth.roles role on role.id = membership_role.role_id
        where role.tenant_id is null
      `,
 params: z.tuple([]), row: idRow, expects: 'many',
});

export const activeUserMembership = defineQuery({
 name: 'auth.activeUserMembership', text: sql`
          select id
          from auth.memberships
          where user_id = $1
            and tenant_id = $2
            and is_active = true
          limit 1
        `,
 params: z.tuple([text, text]), row: idRow, expects: 'many',
});

export const hashPermissionUniverse = defineQuery({
 name: 'auth.hashPermissionUniverse', text: sql`select key from auth.perms`,
 params: z.tuple([]), row: keyRow, expects: 'many',
});

export const hashMembershipGrants = defineQuery({
 name: 'auth.hashMembershipGrants', text: sql`
          select distinct perm.key
          from auth.direct_perms direct_perm
          join auth.perms perm on perm.id = direct_perm.perm_id
          where direct_perm.membership_id = $1::uuid
            and direct_perm.effect = 'allow'
          union
          select distinct perm.key
          from auth.membership_roles membership_role
          join auth.role_perms role_perm on role_perm.role_id = membership_role.role_id
          join auth.perms perm on perm.id = role_perm.perm_id
          where membership_role.membership_id = $1::uuid
          union
          select distinct perm.key
          from auth.group_memberships group_membership
          join auth.group_roles group_role on group_role.group_id = group_membership.group_id
          join auth.role_perms role_perm on role_perm.role_id = group_role.role_id
          join auth.perms perm on perm.id = role_perm.perm_id
          where group_membership.membership_id = $1::uuid
        `,
 params: z.tuple([uuid]), row: keyRow, expects: 'many',
});

export const writeMembershipHash = defineQuery({
 name: 'auth.writeMembershipHash', text: sql`
          update auth.memberships
          set effective_hash = $2,
              effective_hash_generation = effective_hash_generation + 1
          where id = $1::uuid
        `,
 params: z.tuple([uuid, text]), row: z.object({}), expects: 'none',
});

export const cognitoUser = defineQuery({
 name: 'auth.cognitoUser', text: sql`
            select id, external_subject, email
            from auth.users
            where external_subject = $1
               or ($2::text is not null and email = $2)
            limit 1
          `,
 params: z.tuple([text, text.nullable()]), row: z.object({ id: uuid, external_subject: text.nullable(), email: text }), expects: 'many',
});

export const updateCognitoUser = defineQuery({
 name: 'auth.updateCognitoUser', text: sql`
              update auth.users
              set external_subject = $2,
                  email = $3,
                  updated_at = clock_timestamp()
              where id = $1::uuid
            `,
 params: z.tuple([uuid, text, text]), row: z.object({}), expects: 'none',
});

export const insertCognitoUser = defineQuery({
 name: 'auth.insertCognitoUser', text: sql`
            insert into auth.users (id, email, external_subject, locale, created_at, updated_at)
            values ($1::uuid, $2, $3, 'pt-BR', clock_timestamp(), clock_timestamp())
          `,
 params: z.tuple([uuid, text, text]), row: z.object({}), expects: 'none',
});

