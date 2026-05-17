import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { FlowAnalyticsService } from '../flow-analytics.service';

@Controller('/flow')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowAnalyticsController {
  constructor(private readonly analytics: FlowAnalyticsService) {}

  @Permission('flow:read:analytics')
  @ReadOnly()
  @Get('/open-tasks')
  openTasks(@Query() query: Record<string, unknown>) {
    return this.analytics.openTasks(query);
  }
}
