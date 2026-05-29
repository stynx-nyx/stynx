import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent } from '@stynx/backend';
import { Idempotent } from '@stynx/idempotency';
import { FlowFormsService } from '../flow-forms.service';
import type { CreateFlowWaiverDto, UpdateFlowWaiverDto } from '../types';

@Controller('/flow/waivers')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowWaiversController {
  constructor(private readonly forms: FlowFormsService) {}

  @Permission('flow:read:runtime')
  @ReadOnly()
  @Get()
  list(@Query() query: Record<string, unknown>) {
    return this.forms.listWaivers(query);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.waiver.create', entity: 'flow.waivers' })
  @Idempotent('Idempotency-Key')
  @Post()
  create(@Body() input: CreateFlowWaiverDto) {
    return this.forms.createWaiver(input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.waiver.update', entity: 'flow.waivers' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateFlowWaiverDto) {
    return this.forms.updateWaiver(id, input);
  }

  @Permission('flow:execute:task')
  @Audit({ action: 'flow.waiver.delete', entity: 'flow.waivers' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.forms.deleteWaiver(id);
  }
}
