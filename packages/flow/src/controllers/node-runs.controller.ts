import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx-nyx/auth';
import { FlowRuntimeService } from '../flow-runtime.service';

@Controller('/flow/node-runs')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowNodeRunsController {
  constructor(private readonly runtime: FlowRuntimeService) {}

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.runtime.listNodeRuns(query);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.runtime.getNodeRun(id);
  }
}
