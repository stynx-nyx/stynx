export interface StynxTenancyModuleOptions {
  headerName?: string;
  allowSubdomain?: boolean;
  subdomainPattern?: RegExp;
}

export interface ResolvedStynxTenancyModuleOptions {
  headerName: string;
  allowSubdomain: boolean;
  subdomainPattern?: RegExp;
  membershipCacheTtlMs: number;
  membershipCacheMaxEntries: number;
  platformAdminEnvFlag: string;
}

export interface ProvisionTenantInput {
  slug: string;
  name: string;
  ownerEmail: string;
  ownerLocale?: string;
  ownerUserId?: string;
}

export interface UpdateTenantInput {
  slug?: string;
  name?: string;
  timezone?: string | null;
  locale?: string | null;
  settings?: Record<string, unknown>;
}

export interface SuspendTenantInput {
  reason: string;
}

export interface TenantSummary {
  id: string;
  slug: string;
  name: string;
  state: TenantState;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantDetail extends TenantSummary {
  timezone?: string | null;
  locale?: string | null;
  settings: Record<string, unknown>;
  suspendedReason?: string | null;
  archivedAt?: string | null;
}

export interface ProvisionTenantResult {
  tenant: TenantDetail;
  invitationToken: string;
  ownerUserId: string;
}

export interface SuspendTenantResult {
  tenant: TenantDetail;
  activeSessionCount: number;
}

export interface ArchiveTenantResult {
  tenant: TenantDetail;
  exportKey: string;
}

export interface PurgeTenantResult {
  tenant: TenantDetail;
}

export type TenantState = 'provisioning' | 'active' | 'suspended' | 'archived' | 'purged';

export interface RequestLike {
  headers: Record<string, unknown>;
  hostname?: string;
  host?: string;
  originalUrl?: string;
  url?: string;
  tenantId?: string;
  principal?: { id?: string };
  user?: { id?: string };
  stynxClaims?: { sub: string; tenantId: string };
}

export function resolveTenancyOptions(
  options: StynxTenancyModuleOptions,
): ResolvedStynxTenancyModuleOptions {
  return {
    headerName: options.headerName ?? 'X-Tenant-Id',
    allowSubdomain: options.allowSubdomain ?? false,
    ...(options.subdomainPattern ? { subdomainPattern: options.subdomainPattern } : {}),
    membershipCacheTtlMs: 5_000,
    membershipCacheMaxEntries: 1_000,
    platformAdminEnvFlag: 'STYNX_TENANCY_PLATFORM_ADMIN',
  };
}
