import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx/auth';
import { Idempotent } from '@stynx/idempotency';
import { RateLimit } from '@stynx/ratelimit';
import { Audit } from '@stynx/backend';
import type { CreateWorkItemLockDto, ListQuery, UpdateWorkItemLockDto } from './dto';
import { ReferenceSampleService } from './reference-sample.service';

@Controller('/work-item-locks')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class WorkItemLocksController {
  constructor(private readonly sampleService: ReferenceSampleService) {}

  @Get()
  @ReadOnly()
  @Permission('sample:work-item-lock:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-locks.list' })
  @Audit({ action: 'sample.work-item-lock.list', entity: 'sample.work_item_lock' })
  list(@Query() query: ListQuery) {
    return this.sampleService.listWorkItemLocks(query);
  }

  @Get('/:id')
  @ReadOnly()
  @Permission('sample:work-item-lock:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-locks.get' })
  @Audit({ action: 'sample.work-item-lock.get', entity: 'sample.work_item_lock' })
  get(@Param('id') id: string) {
    return this.sampleService.getWorkItemLock(id);
  }

  @Post()
  @Permission('sample:work-item-lock:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-locks.create', cost: 2, limit: 2, windowSeconds: 60 })
  @Audit({ action: 'sample.work-item-lock.create', entity: 'sample.work_item_lock' })
  create(@Body() body: CreateWorkItemLockDto) {
    return this.sampleService.createWorkItemLock(body);
  }

  @Patch('/:id')
  @Permission('sample:work-item-lock:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-locks.update', cost: 2 })
  @Audit({ action: 'sample.work-item-lock.update', entity: 'sample.work_item_lock' })
  update(@Param('id') id: string, @Body() body: UpdateWorkItemLockDto) {
    return this.sampleService.updateWorkItemLock(id, body);
  }

  @Delete('/:id')
  @Permission('sample:work-item-lock:delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-locks.delete', cost: 2 })
  @Audit({ action: 'sample.work-item-lock.soft-delete', entity: 'sample.work_item_lock' })
  delete(@Param('id') id: string) {
    return this.sampleService.softDeleteWorkItemLock(id);
  }

  @Post('/:id/restore')
  @Permission('sample:work-item-lock:restore')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-locks.restore', cost: 2 })
  @Audit({ action: 'sample.work-item-lock.restore', entity: 'sample.work_item_lock' })
  restore(@Param('id') id: string) {
    return this.sampleService.restoreWorkItemLock(id);
  }

  @Delete('/:id/hard')
  @Permission('sample:work-item-lock:hard-delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.work-item-locks.hard-delete', cost: 5 })
  @Audit({ action: 'sample.work-item-lock.hard-delete', entity: 'sample.work_item_lock' })
  hardDelete(@Param('id') id: string) {
    return this.sampleService.hardDeleteWorkItemLock(id);
  }
}
