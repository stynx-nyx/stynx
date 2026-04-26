import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx/auth';
import { Idempotent } from '@stynx/idempotency';
import { RateLimit } from '@stynx/ratelimit';
import { Audit } from '@stech/stynx-backend';
import type { CreateWorkItemEntryDto, ListQuery, UpdateWorkItemEntryDto } from './dto';
import { ReferenceSampleService } from './reference-sample.service';

@Controller('/work-item-entries')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class WorkItemEntriesController {
  constructor(private readonly sampleService: ReferenceSampleService) {}

  @Get()
  @ReadOnly()
  @Permission('sample:work-item-entry:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-entries.list' })
  @Audit({ action: 'sample.work-item-entry.list', entity: 'sample.work_item_entry' })
  list(@Query() query: ListQuery) {
    return this.sampleService.listWorkItemEntries(query);
  }

  @Get('/:id')
  @ReadOnly()
  @Permission('sample:work-item-entry:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-entries.get' })
  @Audit({ action: 'sample.work-item-entry.get', entity: 'sample.work_item_entry' })
  get(@Param('id') id: string) {
    return this.sampleService.getWorkItemEntry(id);
  }

  @Post()
  @Permission('sample:work-item-entry:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-entries.create', cost: 2 })
  @Audit({ action: 'sample.work-item-entry.create', entity: 'sample.work_item_entry' })
  create(@Body() body: CreateWorkItemEntryDto) {
    return this.sampleService.createWorkItemEntry(body);
  }

  @Patch('/:id')
  @Permission('sample:work-item-entry:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-entries.update', cost: 2 })
  @Audit({ action: 'sample.work-item-entry.update', entity: 'sample.work_item_entry' })
  update(@Param('id') id: string, @Body() body: UpdateWorkItemEntryDto) {
    return this.sampleService.updateWorkItemEntry(id, body);
  }

  @Delete('/:id')
  @Permission('sample:work-item-entry:delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-entries.delete', cost: 2 })
  @Audit({ action: 'sample.work-item-entry.soft-delete', entity: 'sample.work_item_entry' })
  delete(@Param('id') id: string) {
    return this.sampleService.softDeleteWorkItemEntry(id);
  }

  @Post('/:id/restore')
  @Permission('sample:work-item-entry:restore')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-entries.restore', cost: 2 })
  @Audit({ action: 'sample.work-item-entry.restore', entity: 'sample.work_item_entry' })
  restore(@Param('id') id: string) {
    return this.sampleService.restoreWorkItemEntry(id);
  }

  @Delete('/:id/hard')
  @Permission('sample:work-item-entry:hard-delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-entries.hard-delete', cost: 5 })
  @Audit({ action: 'sample.work-item-entry.hard-delete', entity: 'sample.work_item_entry' })
  hardDelete(@Param('id') id: string) {
    return this.sampleService.hardDeleteWorkItemEntry(id);
  }
}
