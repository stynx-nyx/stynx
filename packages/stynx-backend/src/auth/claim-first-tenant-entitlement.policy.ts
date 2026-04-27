import type {
  TenantEntitlementContext,
  TenantEntitlementPolicy,
} from '@stynx/contracts';

const DEFAULT_CLAIM_KEYS = [
  'custom:tenant_id',
  'tenant_id',
  'tenantId',
  'custom:tenant_ids',
  'tenant_ids',
  'tenants',
  'custom:org_id',
  'org_id',
  'orgId',
] as const;

export interface TenantEntitlementFallback {
  isEntitled(context: TenantEntitlementContext): Promise<boolean> | boolean;
}

export interface ClaimFirstTenantEntitlementPolicyOptions {
  claimKeys?: readonly string[];
  fallback?: TenantEntitlementFallback;
}

/**
 * Canonical PEC-style tenant entitlement:
 * - if tenant claims exist, they are authoritative
 * - if no tenant claim exists, optional fallback checker may query local DB
 */
export class ClaimFirstTenantEntitlementPolicy implements TenantEntitlementPolicy {
  private readonly claimKeys: readonly string[];

  constructor(private readonly options: ClaimFirstTenantEntitlementPolicyOptions = {}) {
    this.claimKeys = options.claimKeys ?? DEFAULT_CLAIM_KEYS;
  }

  async isEntitled(context: TenantEntitlementContext): Promise<boolean> {
    let hasTenantClaim = false;

    for (const claimKey of this.claimKeys) {
      const values = this.parseClaimValues(context.principal.claims[claimKey]);
      if (values.length === 0) continue;
      hasTenantClaim = true;
      if (values.includes(context.tenantId)) {
        return true;
      }
    }

    if (hasTenantClaim) {
      return false;
    }

    if (!this.options.fallback) {
      return false;
    }

    return this.options.fallback.isEntitled(context);
  }

  private parseClaimValues(value: unknown): string[] {
    if (!value) return [];

    if (Array.isArray(value)) {
      return value
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }

    if (typeof value !== 'string') {
      return [];
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((entry): entry is string => typeof entry === 'string')
            .map((entry) => entry.trim())
            .filter(Boolean);
        }
      } catch {
        // fall through to CSV parsing
      }
    }

    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
}

