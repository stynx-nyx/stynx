import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { NoIdempotent } from '@stynx-nyx/idempotency';
import { PrivacyService } from './privacy.service';
import type { PrivacyErasureRequest, PrivacyExportRequest } from './types';

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Post('exports')
  @NoIdempotent()
  exportData(@Body() input: PrivacyExportRequest) {
    return this.privacyService.exportData(input);
  }

  @Post('erasures')
  @NoIdempotent()
  eraseSubject(@Body() input: PrivacyErasureRequest) {
    return this.privacyService.eraseSubject(input);
  }

  @Get('retention')
  applyRetention(@Query('dryRun') dryRun?: string) {
    return this.privacyService.applyRetention(dryRun !== 'false');
  }
}
