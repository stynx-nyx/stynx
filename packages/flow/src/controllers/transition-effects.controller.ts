import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx-nyx/auth';
import { Audit, NoIdempotent } from '@stynx-nyx/backend';
import { FlowDesignService } from '../flow-design.service';
import type { UpdateFlowTransitionEffectDto } from '../types';

@Controller('/flow/transition-effects')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowTransitionEffectsController {
  constructor(private readonly design: FlowDesignService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.design.getTransitionEffect(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.transition_effect.update', entity: 'flow.transition_effects' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateFlowTransitionEffectDto) {
    return this.design.updateTransitionEffect(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.transition_effect.delete', entity: 'flow.transition_effects' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.design.deleteTransitionEffect(id);
  }
}
