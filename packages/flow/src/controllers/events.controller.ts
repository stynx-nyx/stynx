import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx-nyx/auth';
import { FlowRuntimeService } from '../flow-runtime.service';

@Controller('/flow/events')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowEventsController {
  constructor(private readonly runtime: FlowRuntimeService) {}

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.runtime.listEvents(query);
  }
}
