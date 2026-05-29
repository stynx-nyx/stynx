import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent, RateLimit } from '@stynx/backend';
import { Idempotent } from '@stynx/idempotency';
import { FlowFormsService } from '../flow-forms.service';
import type {
  BulkFlowAnswerWriteRequestDto,
  CreateFlowFillDto,
  CreateFlowWaiverDto,
  FlowAnswerWriteDto,
  UpdateFlowFillDto,
} from '../types';

@Controller('/flow/fills')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowFillsController {
  constructor(private readonly forms: FlowFormsService) {}

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.forms.listFills(query);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.forms.getFill(id);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.fill.create', entity: 'flow.fills' })
  @Idempotent('Idempotency-Key')
  @Post()
  create(@Body() input: CreateFlowFillDto) {
    return this.forms.createFillFromBody(input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.fill.update', entity: 'flow.fills' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateFlowFillDto) {
    return this.forms.updateFill(id, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.fill.delete', entity: 'flow.fills' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.forms.deleteFill(id);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:fillId/answers')
  answers(@Param('fillId') fillId: string) {
    return this.forms.listAnswers(fillId);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.answer.upsert', entity: 'flow.answers' })
  @Idempotent('Idempotency-Key')
  @Post('/:fillId/answers')
  upsertAnswer(@Param('fillId') fillId: string, @Body() input: FlowAnswerWriteDto) {
    return this.forms.upsertAnswer(fillId, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.answer.bulk_upsert', entity: 'flow.answers' })
  @Idempotent('Idempotency-Key')
  @RateLimit({ bucket: 'user', scope: 'flow.answer.bulk_upsert' })
  @Put('/:fillId/answers')
  bulkUpsertAnswers(@Param('fillId') fillId: string, @Body() input: BulkFlowAnswerWriteRequestDto) {
    return this.forms.bulkUpsertAnswers(fillId, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.waiver.create', entity: 'flow.waivers' })
  @Idempotent('Idempotency-Key')
  @Post('/:fillId/waivers')
  createWaiver(@Param('fillId') fillId: string, @Body() input: CreateFlowWaiverDto) {
    return this.forms.createFillWaiver(fillId, input);
  }

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get('/:fillId/waivers')
  waivers(@Param('fillId') fillId: string) {
    return this.forms.listFillWaivers(fillId);
  }
}
