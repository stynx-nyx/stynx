import {
  bigint,
  boolean,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenancy';

export const authSchema = pgSchema('auth');

export const users = authSchema.table('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  externalSubject: text('external_subject'),
  locale: text('locale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const memberships = authSchema.table('memberships', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  effectiveHash: text('effective_hash'),
  effectiveHashGeneration: bigint('effective_hash_generation', { mode: 'number' }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const roles = authSchema.table('roles', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id'),
  key: text('key').notNull(),
  name: text('name').notNull(),
});

export const perms = authSchema.table('perms', {
  id: uuid('id').primaryKey(),
  key: text('key').notNull(),
  description: text('description'),
});

export const rolePerms = authSchema.table(
  'role_perms',
  {
    roleId: uuid('role_id').notNull().references(() => roles.id),
    permId: uuid('perm_id').notNull().references(() => perms.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permId] }),
  }),
);

export const membershipRoles = authSchema.table(
  'membership_roles',
  {
    membershipId: uuid('membership_id').notNull().references(() => memberships.id),
    roleId: uuid('role_id').notNull().references(() => roles.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.membershipId, table.roleId] }),
  }),
);

export const directPerms = authSchema.table('direct_perms', {
  id: uuid('id').primaryKey(),
  membershipId: uuid('membership_id').notNull().references(() => memberships.id),
  permId: uuid('perm_id').notNull().references(() => perms.id),
  effect: text('effect').notNull(),
});

export const groups = authSchema.table('groups', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  parentId: uuid('parent_id'),
  key: text('key').notNull(),
  name: text('name').notNull(),
});

export const groupMemberships = authSchema.table(
  'group_memberships',
  {
    groupId: uuid('group_id').notNull().references(() => groups.id),
    membershipId: uuid('membership_id').notNull().references(() => memberships.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.membershipId] }),
  }),
);

export const groupRoles = authSchema.table(
  'group_roles',
  {
    groupId: uuid('group_id').notNull().references(() => groups.id),
    roleId: uuid('role_id').notNull().references(() => roles.id),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.groupId, table.roleId] }),
  }),
);

export const sessions = authSchema.table('sessions', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  membershipId: uuid('membership_id').references(() => memberships.id),
  sid: text('sid').notNull(),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const invitations = authSchema.table('invitations', {
  id: uuid('id').primaryKey(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  email: text('email').notNull(),
  invitedBy: uuid('invited_by').references(() => users.id),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
