import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);

export const membershipPermissionGrants = defineQuery({
 name: 'auth.membershipPermissionGrants',
 text: sql`
            with membership as (
              select id
              from auth.memberships
              where id = $1::uuid
            )
            select distinct perm.key
            from auth.direct_perms direct_perm
            join auth.perms perm on perm.id = direct_perm.perm_id
            join membership membership_row on membership_row.id = direct_perm.membership_id
            where direct_perm.effect = 'allow'
            union
            select distinct perm.key
            from auth.membership_roles membership_role
            join auth.role_perms role_perm on role_perm.role_id = membership_role.role_id
            join auth.perms perm on perm.id = role_perm.perm_id
            join membership membership_row on membership_row.id = membership_role.membership_id
            union
            select distinct perm.key
            from auth.group_memberships group_membership
            join auth.group_roles group_role on group_role.group_id = group_membership.group_id
            join auth.role_perms role_perm on role_perm.role_id = group_role.role_id
            join auth.perms perm on perm.id = role_perm.perm_id
            join membership membership_row on membership_row.id = group_membership.membership_id
          `,
 params: z.tuple([uuid]), row: z.object({ key: text }), expects: 'many',
});

export const permissionUniverse = defineQuery({
 name: 'auth.permissionUniverse',
 text: sql`select key from auth.perms`,
 params: z.tuple([]), row: z.object({ key: text }), expects: 'many',
});

export const membershipRoleKeys = defineQuery({
 name: 'auth.membershipRoleKeys',
 text: sql`
            with membership as (
              select id
              from auth.memberships
              where user_id = $1
                and tenant_id = $2
                and is_active = true
              limit 1
            )
            select distinct role_row.key
            from auth.membership_roles membership_role
            join auth.roles role_row on role_row.id = membership_role.role_id
            join membership membership_row on membership_row.id = membership_role.membership_id
            union
            select distinct role_row.key
            from auth.group_memberships group_membership
            join auth.group_roles group_role on group_role.group_id = group_membership.group_id
            join auth.roles role_row on role_row.id = group_role.role_id
            join membership membership_row on membership_row.id = group_membership.membership_id
          `,
 params: z.tuple([text, text]), row: z.object({ key: text }), expects: 'many',
});


const generation = z.union([text.regex(/^-?\d+$/u), z.number().refine(Number.isInteger)]).nullable();

export const activeMembership = defineQuery({
 name: 'auth.activeMembership',
 text: sql`
            select id as membership_id, effective_hash, effective_hash_generation
            from auth.memberships
            where user_id = $1
              and tenant_id = $2
              and is_active = true
            limit 1
          `,
 params: z.tuple([text, text]),
 row: z.object({ membership_id: uuid, effective_hash: text.nullable(), effective_hash_generation: generation }), expects: 'many',
});

export const membershipHash = defineQuery({
 name: 'auth.membershipHash',
 text: sql`
            select effective_hash, effective_hash_generation
            from auth.memberships
            where user_id = $1
              and tenant_id = $2
              and is_active = true
            limit 1
          `,
 params: z.tuple([text, text]),
 row: z.object({ effective_hash: text.nullable(), effective_hash_generation: generation }), expects: 'many',
});
