import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Permission, PermissionGuard, ReadOnly, StynxAuthGuard } from '@stynx-nyx/auth';
import { Audit, NoIdempotent } from '@stynx-nyx/backend';
import { FlowDesignService } from '../flow-design.service';
import type { CreateFlowScopeDto, UpdateFlowScopeDto } from '../types';

@Controller('/flow/scopes')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowScopesController {
  constructor(private readonly design: FlowDesignService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get()
  list() {
    return this.design.listScopes();
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.design.getScope(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.scope.create', entity: 'flow.scopes' })
  @NoIdempotent()
  @Post()
  create(@Body() input: CreateFlowScopeDto) {
    return this.design.createScope(input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.scope.update', entity: 'flow.scopes' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: UpdateFlowScopeDto) {
    return this.design.updateScope(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.scope.delete', entity: 'flow.scopes' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.design.deleteScope(id);
  }
}
