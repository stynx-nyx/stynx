import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent } from '@stynx/backend';
import { Idempotent } from '@stynx/idempotency';
import { FlowAnalyticsService } from '../flow-analytics.service';
import { FlowRuntimeService } from '../flow-runtime.service';
import type { EnsureFlowRunDto, UpdateFlowRunDto } from '../types';

@Controller('/flow/runs')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowRunsController {
  constructor(
    private readonly runtime: FlowRuntimeService,
    private readonly analytics: FlowAnalyticsService,
  ) {}

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.runtime.listRuns(query);
  }

  @Permission('flow:read:runtime')
  @Audit({ action: 'flow.run.ensure', entity: 'flow.runs' })
  @Idempotent('Idempotency-Key')
  @Post('/ensure')
  ensure(@Body() input: EnsureFlowRunDto) {
    return this.runtime.ensureRun(input);
  }

  @Permission('flow:read:analytics')
  @ReadOnly()
  @Get('/summary')
  summary(@Query() query: Record<string, unknown>) {
    return this.analytics.runsSummary(query);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.runtime.getRun(id);
  }

  @Permission('flow:admin:*')
  @Audit({ action: 'flow.run.update', entity: 'flow.runs' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateFlowRunDto) {
    return this.runtime.updateRun(id, input);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id/nodes')
  listNodeRuns(@Param('id') id: string) {
    return this.runtime.listRunNodeRuns(id);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id/tasks')
  listTasks(@Param('id') id: string) {
    return this.runtime.listRunTasks(id);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id/events')
  listEvents(@Param('id') id: string) {
    return this.runtime.listRunEvents(id);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id/activity')
  activity(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    return this.runtime.listEvents({ ...query, runId: id });
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id/facts')
  facts(@Param('id') id: string) {
    return this.runtime.getRunFacts(id);
  }
}
