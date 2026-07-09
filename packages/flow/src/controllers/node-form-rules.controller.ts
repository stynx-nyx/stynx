import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx-nyx/auth';
import { Audit, NoIdempotent } from '@stynx-nyx/backend';
import { FlowDesignService } from '../flow-design.service';
import type { UpdateFlowNodeFormRuleDto } from '../types';

@Controller('/flow/node-form-rules')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowNodeFormRulesController {
  constructor(private readonly design: FlowDesignService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.design.getNodeFormRule(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.node_form_rule.update', entity: 'flow.node_form_rules' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateFlowNodeFormRuleDto) {
    return this.design.updateNodeFormRule(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.node_form_rule.delete', entity: 'flow.node_form_rules' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.design.deleteNodeFormRule(id);
  }
}
