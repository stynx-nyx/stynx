import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx-nyx/auth';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { PrivacyService } from './privacy.service';
import { PrivacyRetentionPermissionGuard, privacyRetentionDryRun } from './privacy-retention.guard';
import type { PrivacyErasureRequest, PrivacyExportRequest } from './types';

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Post('exports')
  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('privacy:subject-rights')
  @NoIdempotent()
  exportData(@Body() input: PrivacyExportRequest) {
    return this.privacyService.exportTenantData(input);
  }

  @Post('erasures')
  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('privacy:subject-rights')
  @NoIdempotent()
  eraseSubject(@Body() input: PrivacyErasureRequest) {
    return this.privacyService.eraseTenantSubject(input);
  }

  @Get('retention')
  @UseGuards(StynxAuthGuard, PrivacyRetentionPermissionGuard)
  applyRetention(@Query('dryRun') dryRun?: string) {
    return this.privacyService.applyTenantRetention(privacyRetentionDryRun(dryRun));
  }
}
