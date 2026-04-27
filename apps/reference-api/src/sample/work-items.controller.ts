import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx/auth';
import { Idempotent } from '@stynx/idempotency';
import { RateLimit } from '@stynx/ratelimit';
import { Audit } from '@stynx/backend';
import type { CreateWorkItemDto, ListQuery, UpdateWorkItemDto } from './dto';
import { ReferenceSampleService } from './reference-sample.service';

@Controller('/work-items')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class WorkItemsController {
  constructor(private readonly sampleService: ReferenceSampleService) {}

  @Get()
  @ReadOnly()
  @Permission('sample:work-item:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-items.list' })
  @Audit({ action: 'sample.work-item.list', entity: 'sample.work_item' })
  list(@Query() query: ListQuery) {
    return this.sampleService.listWorkItems(query);
  }

  @Get('/trash')
  @ReadOnly()
  @Permission('sample:work-item:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-items.trash' })
  @Audit({ action: 'sample.work-item.trash', entity: 'sample.work_item' })
  trash(@Query() query: ListQuery) {
    return this.sampleService.listDeletedWorkItems(query);
  }

  @Get('/:id')
  @ReadOnly()
  @Permission('sample:work-item:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-items.get' })
  @Audit({ action: 'sample.work-item.get', entity: 'sample.work_item' })
  get(@Param('id') id: string) {
    return this.sampleService.getWorkItem(id);
  }

  @Post()
  @Permission('sample:work-item:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-items.create', cost: 2 })
  @Audit({ action: 'sample.work-item.create', entity: 'sample.work_item' })
  create(@Body() body: CreateWorkItemDto) {
    return this.sampleService.createWorkItem(body);
  }

  @Patch('/:id')
  @Permission('sample:work-item:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-items.update', cost: 2 })
  @Audit({ action: 'sample.work-item.update', entity: 'sample.work_item' })
  update(@Param('id') id: string, @Body() body: UpdateWorkItemDto) {
    return this.sampleService.updateWorkItem(id, body);
  }

  @Delete('/:id')
  @Permission('sample:work-item:delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-items.delete', cost: 3 })
  @Audit({ action: 'sample.work-item.soft-delete', entity: 'sample.work_item' })
  delete(@Param('id') id: string) {
    return this.sampleService.softDeleteWorkItem(id);
  }

  @Post('/:id/restore')
  @Permission('sample:work-item:restore')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-items.restore', cost: 2 })
  @Audit({ action: 'sample.work-item.restore', entity: 'sample.work_item' })
  restore(@Param('id') id: string) {
    return this.sampleService.restoreWorkItem(id);
  }

  @Delete('/:id/hard')
  @Permission('sample:work-item:hard-delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-items.hard-delete', cost: 5 })
  @Audit({ action: 'sample.work-item.hard-delete', entity: 'sample.work_item' })
  hardDelete(@Param('id') id: string) {
    return this.sampleService.hardDeleteWorkItem(id);
  }
}
