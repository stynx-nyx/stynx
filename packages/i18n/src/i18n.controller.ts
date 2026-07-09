import { Body, Controller, Get, Put } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { RequestContext } from '@stynx-nyx/core';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { I18nAdminService } from './i18n-admin.service';
import type { TenantOverrideUpdateInput } from './types';

@Controller('_tenancy/i18n/overrides')
export class I18nController {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly adminService: I18nAdminService,
  ) {}

  @Get()
  listOverrides() {
    return this.adminService.listOverrides(this.requestContext().tenantId ?? '');
  }

  @Put()
  @NoIdempotent()
  updateOverrides(@Body() input: TenantOverrideUpdateInput) {
    return this.adminService.updateOverrides(this.requestContext().tenantId ?? '', input);
  }

  private requestContext(): RequestContext {
    return this.moduleRef.get(RequestContext, { strict: false });
  }
}
