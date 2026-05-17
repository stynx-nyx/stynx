import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent } from '@stynx/backend';
import { FlowDesignService } from '../flow-design.service';

@Controller('/flow/nodes')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowNodesController {
  constructor(private readonly design: FlowDesignService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.design.getNode(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.node.update', entity: 'flow.nodes' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: unknown) {
    return this.design.updateNode(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.node.delete', entity: 'flow.nodes' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.design.deleteNode(id);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:nodeId/agent-rules')
  listAgentRules(@Param('nodeId') nodeId: string) {
    return this.design.listNodeAgentRules(nodeId);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.agent_rule.create', entity: 'flow.agent_rules' })
  @NoIdempotent()
  @Post('/:nodeId/agent-rules')
  createAgentRule(@Param('nodeId') nodeId: string, @Body() input: unknown) {
    return this.design.createNodeAgentRule(nodeId, input);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:nodeId/form-rules')
  listFormRules(@Param('nodeId') nodeId: string) {
    return this.design.listNodeFormRules(nodeId);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.node_form_rule.create', entity: 'flow.node_form_rules' })
  @NoIdempotent()
  @Post('/:nodeId/form-rules')
  createFormRule(@Param('nodeId') nodeId: string, @Body() input: unknown) {
    return this.design.createNodeFormRule(nodeId, input);
  }
}
