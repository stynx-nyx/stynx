import { Body, Controller, Delete, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx/auth';
import { Audit, NoIdempotent } from '@stynx/backend';
import { FlowDesignService } from '../flow-design.service';
import type { UpdateFlowEdgeDto } from '../types';

@Controller('/flow/edges')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowEdgesController {
  constructor(private readonly design: FlowDesignService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.design.getEdge(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.edge.update', entity: 'flow.edges' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateFlowEdgeDto) {
    return this.design.updateEdge(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.edge.delete', entity: 'flow.edges' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.design.deleteEdge(id);
  }
}
