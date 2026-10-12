import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { RequestContext } from '@stynx-nyx/core';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { I18nAdminService } from './i18n-admin.service';
import type { TenantOverrideUpdateInput } from './types';

@Controller('_tenancy/i18n/overrides')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class I18nController {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly adminService: I18nAdminService,
  ) {}

  @Get()
  @Permission('i18n:read')
  listOverrides() {
    return this.adminService.listTenantOverrides(this.requestContext().tenantId ?? '');
  }

  @Put()
  @NoIdempotent()
  @Permission('i18n:write')
  updateOverrides(@Body() input: TenantOverrideUpdateInput) {
    return this.adminService.updateTenantOverrides(this.requestContext().tenantId ?? '', input);
  }

  private requestContext(): RequestContext {
    return this.moduleRef.get(RequestContext, { strict: false });
  }
}
