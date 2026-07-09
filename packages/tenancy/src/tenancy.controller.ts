import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { TenancyPlatformAdminGuard } from './tenancy-platform-admin.guard';
import { TenancyService } from './tenancy.service';
import type { ProvisionTenantInput, SuspendTenantInput, UpdateTenantInput } from './types';

@Controller('/tenants')
@UseGuards(TenancyPlatformAdminGuard)
export class TenancyController {
  constructor(private readonly tenancyService: TenancyService) {}

  @Get()
  list() {
    return this.tenancyService.listTenants();
  }

  @Get('/:id')
  get(@Param('id') id: string) {
    return this.tenancyService.getTenant(id);
  }

  @NoIdempotent()
  @Post()
  create(@Body() input: ProvisionTenantInput) {
    return this.tenancyService.provisionTenant(input);
  }

  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateTenantInput) {
    return this.tenancyService.updateTenant(id, input);
  }

  @NoIdempotent()
  @Post('/:id/suspend')
  suspend(@Param('id') id: string, @Body() input: SuspendTenantInput) {
    return this.tenancyService.suspendTenant(id, input);
  }

  @NoIdempotent()
  @Post('/:id/archive')
  archive(@Param('id') id: string) {
    return this.tenancyService.archiveTenant(id);
  }

  @NoIdempotent()
  @Post('/:id/purge')
  purge(@Param('id') id: string) {
    return this.tenancyService.purgeTenant(id);
  }
}
