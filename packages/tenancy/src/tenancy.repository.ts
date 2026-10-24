import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

const uuid = z.string().regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const text = z.string();
const nullableText = text.nullable();
const idRow = z.object({ id: uuid });
const tenantRow = z.object({
 id: uuid, slug: text, name: text, state: z.enum(['provisioning', 'active', 'suspended', 'archived', 'purged']).nullable(),
 is_active: z.boolean(), created_at: text, updated_at: text, timezone: nullableText, locale: nullableText,
 settings: z.record(z.string(), z.unknown()).nullable(), suspended_reason: nullableText, archived_at: nullableText,
});
export type TenantRow = z.output<typeof tenantRow>;

export const listTenants = defineQuery({
 name: 'tenancy.listTenants',
 text: sql`
      select
        tenant.id::text as id,
        tenant.slug,
        tenant.name,
        tenant.state,
        tenant.is_active,
        tenant.created_at::text as created_at,
        tenant.updated_at::text as updated_at,
        settings.timezone,
        settings.locale,
        settings.settings,
        tenant.suspended_reason,
        tenant.archived_at::text as archived_at
      from tenancy.tenants tenant
      left join tenancy.tenant_settings settings
        on settings.tenant_id = tenant.id
      
          order by tenant.created_at desc
        
    `,
 params: z.tuple([]), row: tenantRow, expects: 'many',
});

export const tenantById = defineQuery({
 name: 'tenancy.tenantById',
 text: sql`
      select
        tenant.id::text as id,
        tenant.slug,
        tenant.name,
        tenant.state,
        tenant.is_active,
        tenant.created_at::text as created_at,
        tenant.updated_at::text as updated_at,
        settings.timezone,
        settings.locale,
        settings.settings,
        tenant.suspended_reason,
        tenant.archived_at::text as archived_at
      from tenancy.tenants tenant
      left join tenancy.tenant_settings settings
        on settings.tenant_id = tenant.id
      where tenant.id = $1::uuid limit 1
    `,
 params: z.tuple([uuid]), row: tenantRow, expects: 'zero-or-one',
});

export const tenantBySlug = defineQuery({
 name: 'tenancy.tenantBySlug',
 text: sql`
      select
        tenant.id::text as id,
        tenant.slug,
        tenant.name,
        tenant.state,
        tenant.is_active,
        tenant.created_at::text as created_at,
        tenant.updated_at::text as updated_at,
        settings.timezone,
        settings.locale,
        settings.settings,
        tenant.suspended_reason,
        tenant.archived_at::text as archived_at
      from tenancy.tenants tenant
      left join tenancy.tenant_settings settings
        on settings.tenant_id = tenant.id
      where tenant.slug = $1 limit 1
    `,
 params: z.tuple([text]), row: tenantRow, expects: 'zero-or-one',
});

export const updateTenant = defineQuery({
 name: 'tenancy.updateTenant',
 text: sql`
            update tenancy.tenants
               set slug = $2,
                   name = $3,
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
 params: z.tuple([uuid, text, text]), row: z.object({}), expects: 'none',
});

export const upsertTenantSettings = defineQuery({
 name: 'tenancy.upsertTenantSettings',
 text: sql`
              insert into tenancy.tenant_settings (tenant_id, timezone, locale, settings, updated_at)
              values ($1::uuid, $2, $3, $4::jsonb, clock_timestamp())
              on conflict (tenant_id)
              do update set
                timezone = excluded.timezone,
                locale = excluded.locale,
                settings = excluded.settings,
                updated_at = clock_timestamp()
            `,
 params: z.tuple([uuid, nullableText, nullableText, text]), row: z.object({}), expects: 'none',
});

export const lockTenantSlug = defineQuery({
 name: 'tenancy.lockTenantSlug',
 text: sql`select pg_advisory_xact_lock(hashtext($1))`,
 params: z.tuple([text]), row: z.object({ pg_advisory_xact_lock: z.literal('') }), expects: 'zero-or-one',
});

export const insertTenant = defineQuery({
 name: 'tenancy.insertTenant',
 text: sql`
            insert into tenancy.tenants (id, slug, name, state, is_active, created_at, updated_at)
            values ($1::uuid, $2, $3, 'provisioning', true, clock_timestamp(), clock_timestamp())
          `,
 params: z.tuple([uuid, text, text]), row: z.object({}), expects: 'none',
});

export const upsertOwner = defineQuery({
 name: 'tenancy.upsertOwner',
 text: sql`
            insert into auth.users (id, email, locale, created_at, updated_at)
            values ($1::uuid, $2::citext, $3, clock_timestamp(), clock_timestamp())
            on conflict (email)
            do update set
              locale = coalesce(excluded.locale, auth.users.locale),
              updated_at = clock_timestamp()
          `,
 params: z.tuple([uuid, text, nullableText]), row: z.object({}), expects: 'none',
});

export const userByEmail = defineQuery({
 name: 'tenancy.userByEmail',
 text: sql`select id::text as id from auth.users where email = $1::citext limit 1`,
 params: z.tuple([text]), row: idRow, expects: 'zero-or-one',
});

export const upsertMembership = defineQuery({
 name: 'tenancy.upsertMembership',
 text: sql`
            insert into auth.memberships (id, tenant_id, user_id, is_active, created_at)
            values ($1::uuid, $2::uuid, $3::uuid, false, clock_timestamp())
            on conflict (tenant_id, user_id)
            do update set user_id = excluded.user_id
            returning id::text as id
          `,
 params: z.tuple([uuid, uuid, uuid]), row: idRow, expects: 'zero-or-one',
});

export const ownerRoleByTenant = defineQuery({
 name: 'tenancy.ownerRole',
 text: sql`select id::text as id from auth.roles where tenant_id = $1::uuid and key = 'owner' limit 1`,
 params: z.tuple([uuid]), row: idRow, expects: 'zero-or-one',
});

export const assignOwnerRole = defineQuery({
 name: 'tenancy.assignOwnerRole',
 text: sql`
              insert into auth.membership_roles (membership_id, role_id)
              values ($1::uuid, $2::uuid)
              on conflict do nothing
            `,
 params: z.tuple([uuid, uuid]), row: z.object({}), expects: 'none',
});

export const activateTenant = defineQuery({
 name: 'tenancy.activateTenant',
 text: sql`
            update tenancy.tenants
               set state = 'active',
                   is_active = true,
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
 params: z.tuple([uuid]), row: z.object({}), expects: 'none',
});

export const suspendTenant = defineQuery({
 name: 'tenancy.suspendTenant',
 text: sql`
            update tenancy.tenants
               set is_active = false,
                   state = 'suspended',
                   suspended_reason = $2,
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
 params: z.tuple([uuid, text]), row: z.object({}), expects: 'none',
});

export const activeSessionCount = defineQuery({
 name: 'tenancy.activeSessionCount',
 text: sql`
            select count(*)::text as count
            from auth.sessions
            where tenant_id = $1::uuid
              and status = 'active'
              and expires_at > clock_timestamp()
          `,
 params: z.tuple([uuid]), row: z.object({ count: text.regex(/^\d+$/u) }), expects: 'zero-or-one',
});

export const archiveTenant = defineQuery({
 name: 'tenancy.archiveTenant',
 text: sql`
            update tenancy.tenants
               set is_active = false,
                   state = 'archived',
                   archived_at = coalesce(archived_at, clock_timestamp()),
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
 params: z.tuple([uuid]), row: z.object({}), expects: 'none',
});

export const purgeTenant = defineQuery({
 name: 'tenancy.purgeTenant',
 text: sql`
            update tenancy.tenants
               set is_active = false,
                   state = 'purged',
                   updated_at = clock_timestamp()
             where id = $1::uuid
          `,
 params: z.tuple([uuid]), row: z.object({}), expects: 'none',
});

export const upsertRole = defineQuery({
 name: 'tenancy.upsertRole',
 text: sql`
          insert into auth.roles (id, tenant_id, key, name, created_at)
          values ($1::uuid, $2::uuid, $3, $4, clock_timestamp())
          on conflict (tenant_id, key)
          do update set name = excluded.name
        `,
 params: z.tuple([uuid, uuid, text, text]), row: z.object({}), expects: 'none',
});

export const pendingInvitation = defineQuery({
 name: 'tenancy.pendingInvitation',
 text: sql`
        select invitation.token::text as token, membership.user_id::text as user_id
        from auth.invitations invitation
        join auth.users usr on usr.email = invitation.email
        left join auth.memberships membership
          on membership.tenant_id = invitation.tenant_id
         and membership.user_id = usr.id
        where invitation.tenant_id = $1::uuid
          and invitation.email = $2::citext
          and invitation.status = 'pending'
        order by invitation.created_at desc
        limit 1
      `,
 params: z.tuple([uuid, text]), row: z.object({ token: text, user_id: uuid.nullable() }), expects: 'zero-or-one',
});

export const insertInvitation = defineQuery({
 name: 'tenancy.insertInvitation',
 text: sql`
        insert into auth.invitations (id, tenant_id, email, invited_by, token, status, expires_at, created_at)
        values ($1::uuid, $2::uuid, $3::citext, $4::uuid, $5, 'pending', clock_timestamp() + interval '7 days', clock_timestamp())
      `,
 params: z.tuple([uuid, uuid, text, uuid, text]), row: z.object({}), expects: 'none',
});

export const activeTenantAdmission = defineQuery({
 name: 'tenancy.activeTenantAdmission',
 text: sql`select exists (select 1 from tenancy.tenants where id = $1::uuid and is_active = true and coalesce(state, 'active') = 'active') as allowed`,
 params: z.tuple([uuid]), row: z.object({ allowed: z.boolean() }), expects: 'zero-or-one',
});

export const activeMembershipAdmission = defineQuery({
 name: 'tenancy.activeMembershipAdmission',
 text: sql`
          select exists (
            select 1
            from auth.memberships membership
            join tenancy.tenants tenant
              on tenant.id = membership.tenant_id
            where membership.user_id = $1::uuid
              and membership.tenant_id = $2::uuid
              and membership.is_active = true
              and tenant.is_active = true
              and coalesce(tenant.state, 'active') = 'active'
          ) as allowed
        `,
 params: z.tuple([uuid, uuid]), row: z.object({ allowed: z.boolean() }), expects: 'zero-or-one',
});

export const recordSystemOperation = defineQuery({
 name: 'tenancy.recordSystemOperation',
 text: sql`
          insert into audit.system_op (occurred_at, reason, actor_id, request_id, payload)
          values ($1::timestamptz, $2, $3::uuid, $4, $5::jsonb)
        `,
 params: z.tuple([z.union([z.instanceof(Date), text]), text, uuid.nullable(), text, text]), row: z.object({}), expects: 'none',
});

