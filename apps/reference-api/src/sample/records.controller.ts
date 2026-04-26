import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx/auth';
import { Idempotent } from '@stynx/idempotency';
import { RateLimit } from '@stynx/ratelimit';
import { Audit } from '@stech/stynx-backend';
import type { CreateRecordDto, ListQuery, UpdateRecordDto } from './dto';
import { ReferenceSampleService } from './reference-sample.service';

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function recordCreateRateLimit() {
  return {
    bucket: 'tenant' as const,
    scope: 'sample.records.create',
    cost: 2,
    limit: envNumber('STYNX_SAMPLE_RECORD_CREATE_LIMIT', 120),
    windowSeconds: envNumber('STYNX_SAMPLE_RECORD_CREATE_WINDOW_SECONDS', 60),
  };
}

function recordReadRateLimit(scope: string) {
  return {
    bucket: 'tenant' as const,
    scope,
    cost: 1,
    limit: envNumber('STYNX_SAMPLE_RECORD_READ_LIMIT', 150),
    windowSeconds: envNumber('STYNX_SAMPLE_RECORD_READ_WINDOW_SECONDS', 60),
  };
}

function recordDeleteRateLimit() {
  return {
    bucket: 'tenant' as const,
    scope: 'sample.records.delete',
    cost: 3,
    limit: envNumber('STYNX_SAMPLE_RECORD_DELETE_LIMIT', 60),
    windowSeconds: envNumber('STYNX_SAMPLE_RECORD_DELETE_WINDOW_SECONDS', 60),
  };
}

@Controller('/records')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class RecordsController {
  constructor(private readonly sampleService: ReferenceSampleService) {}

  @Get()
  @ReadOnly()
  @Permission('sample:record:read')
  @RateLimit(recordReadRateLimit('sample.records.list'))
  @Audit({ action: 'sample.record.list', entity: 'sample.record' })
  list(@Query() query: ListQuery) {
    return this.sampleService.listRecords(query);
  }

  @Get('/trash')
  @ReadOnly()
  @Permission('sample:record:read')
  @RateLimit(recordReadRateLimit('sample.records.trash'))
  @Audit({ action: 'sample.record.trash', entity: 'sample.record' })
  trash(@Query() query: ListQuery) {
    return this.sampleService.listDeletedRecords(query);
  }

  @Get('/:id')
  @ReadOnly()
  @Permission('sample:record:read')
  @RateLimit(recordReadRateLimit('sample.records.get'))
  @Audit({ action: 'sample.record.get', entity: 'sample.record' })
  get(@Param('id') id: string) {
    return this.sampleService.getRecord(id);
  }

  @Post()
  @Permission('sample:record:write')
  @Idempotent()
  @RateLimit(recordCreateRateLimit())
  @Audit({ action: 'sample.record.create', entity: 'sample.record' })
  create(@Body() body: CreateRecordDto) {
    return this.sampleService.createRecord(body);
  }

  @Patch('/:id')
  @Permission('sample:record:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.records.update', cost: 2 })
  @Audit({ action: 'sample.record.update', entity: 'sample.record' })
  update(@Param('id') id: string, @Body() body: UpdateRecordDto) {
    return this.sampleService.updateRecord(id, body);
  }

  @Delete('/:id')
  @Permission('sample:record:delete')
  @Idempotent()
  @RateLimit(recordDeleteRateLimit())
  @Audit({ action: 'sample.record.soft-delete', entity: 'sample.record' })
  delete(@Param('id') id: string) {
    return this.sampleService.softDeleteRecord(id);
  }

  @Post('/:id/restore')
  @Permission('sample:record:restore')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.records.restore', cost: 2 })
  @Audit({ action: 'sample.record.restore', entity: 'sample.record' })
  restore(@Param('id') id: string) {
    return this.sampleService.restoreRecord(id);
  }

  @Delete('/:id/hard')
  @Permission('sample:record:hard-delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.records.hard-delete', cost: 5 })
  @Audit({ action: 'sample.record.hard-delete', entity: 'sample.record' })
  hardDelete(@Param('id') id: string) {
    return this.sampleService.hardDeleteRecord(id);
  }
}
