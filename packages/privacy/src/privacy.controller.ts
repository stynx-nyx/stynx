import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PrivacyService } from './privacy.service';
import type { PrivacyErasureRequest, PrivacyExportRequest } from './types';

@Controller('privacy')
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  @Post('exports')
  exportData(@Body() input: PrivacyExportRequest) {
    return this.privacyService.exportData(input);
  }

  @Post('erasures')
  eraseSubject(@Body() input: PrivacyErasureRequest) {
    return this.privacyService.eraseSubject(input);
  }

  @Get('retention')
  applyRetention(@Query('dryRun') dryRun?: string) {
    return this.privacyService.applyRetention(dryRun !== 'false');
  }
}
