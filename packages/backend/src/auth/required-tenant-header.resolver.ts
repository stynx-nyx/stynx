import { BadRequestException } from '@nestjs/common';
import type { TenantResolver, TenantResolverContext } from '@stynx/contracts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RequiredTenantHeaderResolverOptions {
  headerName?: string;
  requireUuid?: boolean;
}

/**
 * Canonical PEC-style tenant resolver:
 * - requires explicit tenant header context
 * - optionally enforces UUID format
 */
export class RequiredTenantHeaderResolver implements TenantResolver {
  private readonly headerName: string;
  private readonly requireUuid: boolean;

  constructor(options: RequiredTenantHeaderResolverOptions = {}) {
    this.headerName = options.headerName ?? 'x-tenant-id';
    this.requireUuid = options.requireUuid ?? true;
  }

  resolve(context: TenantResolverContext): string {
    const tenantId = context.headerTenantId?.trim();
    if (!tenantId) {
      throw new BadRequestException(`${this.headerName} header is required`);
    }
    if (this.requireUuid && !UUID_PATTERN.test(tenantId)) {
      throw new BadRequestException(`${this.headerName} must be a UUID`);
    }
    return tenantId;
  }
}

