import {
  Body,
  Controller,
  Delete,
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
import { FlowDesignService } from '../flow-design.service';

@Controller('/flow/graphs')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class FlowGraphsController {
  constructor(private readonly design: FlowDesignService) {}

  @Permission('flow:read:design')
  @ReadOnly()
  @Get()
  list(@Query('scopeId') scopeId?: string) {
    return this.design.listGraphs(scopeId);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id')
  get(@Param('id') id: string) {
    return this.design.getGraph(id);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:id/export')
  export(@Param('id') id: string) {
    return this.design.exportGraph(id);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.graph.create', entity: 'flow.graphs' })
  @NoIdempotent()
  @Post()
  create(@Body() input: unknown) {
    return this.design.createGraph(input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.graph.import', entity: 'flow.graphs' })
  @Idempotent('Idempotency-Key')
  @Post('/import')
  import(@Body() input: unknown) {
    return this.design.importGraph(input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.graph.update', entity: 'flow.graphs' })
  @NoIdempotent()
  @Patch('/:id')
  update(@Param('id') id: string, @Body() input: unknown) {
    return this.design.updateGraph(id, input);
  }

  @Permission('flow:publish:design')
  @Audit({ action: 'flow.graph.publish', entity: 'flow.graphs' })
  @Idempotent('Idempotency-Key')
  @Post('/:id/publish')
  publish(@Param('id') id: string, @Body() input: unknown) {
    return this.design.publishGraph(id, input);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.graph.delete', entity: 'flow.graphs' })
  @Delete('/:id')
  delete(@Param('id') id: string) {
    return this.design.deleteGraph(id);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:graphId/nodes')
  listNodes(@Param('graphId') graphId: string) {
    return this.design.listGraphNodes(graphId);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.node.create', entity: 'flow.nodes' })
  @NoIdempotent()
  @Post('/:graphId/nodes')
  createNode(@Param('graphId') graphId: string, @Body() input: unknown) {
    return this.design.createGraphNode(graphId, input);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:graphId/edges')
  listEdges(@Param('graphId') graphId: string) {
    return this.design.listGraphEdges(graphId);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.edge.create', entity: 'flow.edges' })
  @NoIdempotent()
  @Post('/:graphId/edges')
  createEdge(@Param('graphId') graphId: string, @Body() input: unknown) {
    return this.design.createGraphEdge(graphId, input);
  }

  @Permission('flow:read:design')
  @ReadOnly()
  @Get('/:graphId/transition-effects')
  listTransitionEffects(@Param('graphId') graphId: string) {
    return this.design.listGraphTransitionEffects(graphId);
  }

  @Permission('flow:write:design')
  @Audit({ action: 'flow.transition_effect.create', entity: 'flow.transition_effects' })
  @NoIdempotent()
  @Post('/:graphId/transition-effects')
  createTransitionEffect(@Param('graphId') graphId: string, @Body() input: unknown) {
    return this.design.createGraphTransitionEffect(graphId, input);
  }
}
