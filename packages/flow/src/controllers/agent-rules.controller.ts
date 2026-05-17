import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent } from '@stynx/backend';
import { FlowDesignService } from '../flow-design.service';

@Controller('/flow/agent-rules')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowAgentRulesController {
  constructor(private readonly design: FlowDesignService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.design.getAgentRule(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.agent_rule.update', entity: 'flow.agent_rules' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: unknown) {
    return this.design.updateAgentRule(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.agent_rule.delete', entity: 'flow.agent_rules' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.design.deleteAgentRule(id);
  }
}
