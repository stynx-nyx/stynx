import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, StynxAuthGuard } from '@stynx/auth';
import { StynxAuditService } from './audit.service';
import type { AuditLogQuery } from './types';

@Controller()
export class StynxAuditController {
  constructor(private readonly auditService: StynxAuditService) {}

  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('platform:audit:read:*')
  @Get('/_audit/log')
  list(@Query() query: AuditLogQuery) {
    return this.auditService.listLog(query);
  }
}
