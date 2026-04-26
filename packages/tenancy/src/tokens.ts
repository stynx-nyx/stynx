import type { ResolvedStynxTenancyModuleOptions } from './types';

export const STYNX_TENANCY_OPTIONS = Symbol('STYNX_TENANCY_OPTIONS');
export const STYNX_TENANT_PREFIX_PROVISIONER = Symbol('STYNX_TENANT_PREFIX_PROVISIONER');
export const STYNX_TENANT_INVITE_SENDER = Symbol('STYNX_TENANT_INVITE_SENDER');
export const STYNX_TENANT_ARCHIVE_EXPORTER = Symbol('STYNX_TENANT_ARCHIVE_EXPORTER');
export const STYNX_TENANT_PURGE_DELEGATE = Symbol('STYNX_TENANT_PURGE_DELEGATE');
export const STYNX_TENANT_MEMBERSHIP_CACHE = Symbol('STYNX_TENANT_MEMBERSHIP_CACHE');

export interface TenantPrefixProvisioner {
  ensurePrefix(tenantId: string): Promise<void>;
}

export interface TenantInviteSender {
  sendOwnerInvite(input: {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    email: string;
    invitationToken: string;
  }): Promise<void>;
}

export interface TenantArchiveExporter {
  exportPlaceholder(tenantId: string): Promise<string>;
}

export interface TenantPurgeDelegate {
  purgeTenant(tenantId: string): Promise<void>;
}

export type { ResolvedStynxTenancyModuleOptions };
