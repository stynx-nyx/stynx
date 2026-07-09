import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx-nyx/auth';
import { Idempotent } from '@stynx-nyx/idempotency';
import { RateLimit } from '@stynx-nyx/ratelimit';
import { Audit } from '@stynx-nyx/backend';
import type { CreateRecordNoteDto, ListQuery, UpdateRecordNoteDto } from './dto';
import { ReferenceSampleService } from './reference-sample.service';

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function recordNoteCreateRateLimit() {
  return {
    bucket: 'tenant' as const,
    scope: 'sample.record-notes.create',
    cost: 2,
    limit: envNumber('STYNX_SAMPLE_RECORD_NOTE_CREATE_LIMIT', 120),
    windowSeconds: envNumber('STYNX_SAMPLE_RECORD_NOTE_CREATE_WINDOW_SECONDS', 60),
  };
}

@Controller('/record-notes')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class RecordNotesController {
  constructor(private readonly sampleService: ReferenceSampleService) {}

  @Get()
  @ReadOnly()
  @Permission('sample:record-note:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.record-notes.list' })
  @Audit({ action: 'sample.record-note.list', entity: 'sample.record_note' })
  list(@Query() query: ListQuery) {
    return this.sampleService.listRecordNotes(query);
  }

  @Get('/:id')
  @ReadOnly()
  @Permission('sample:record-note:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.record-notes.get' })
  @Audit({ action: 'sample.record-note.get', entity: 'sample.record_note' })
  get(@Param('id') id: string) {
    return this.sampleService.getRecordNote(id);
  }

  @Post()
  @Permission('sample:record-note:write')
  @Idempotent()
  @RateLimit(recordNoteCreateRateLimit())
  @Audit({ action: 'sample.record-note.create', entity: 'sample.record_note' })
  create(@Body() body: CreateRecordNoteDto) {
    return this.sampleService.createRecordNote(body);
  }

  @Patch('/:id')
  @Permission('sample:record-note:write')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.record-notes.update', cost: 2 })
  @Audit({ action: 'sample.record-note.update', entity: 'sample.record_note' })
  update(@Param('id') id: string, @Body() body: UpdateRecordNoteDto) {
    return this.sampleService.updateRecordNote(id, body);
  }

  @Delete('/:id')
  @Permission('sample:record-note:delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.record-notes.delete', cost: 2 })
  @Audit({ action: 'sample.record-note.soft-delete', entity: 'sample.record_note' })
  delete(@Param('id') id: string) {
    return this.sampleService.softDeleteRecordNote(id);
  }

  @Post('/:id/restore')
  @Permission('sample:record-note:restore')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.record-notes.restore', cost: 2 })
  @Audit({ action: 'sample.record-note.restore', entity: 'sample.record_note' })
  restore(@Param('id') id: string) {
    return this.sampleService.restoreRecordNote(id);
  }

  @Delete('/:id/hard')
  @Permission('sample:record-note:hard-delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.record-notes.hard-delete', cost: 5 })
  @Audit({ action: 'sample.record-note.hard-delete', entity: 'sample.record_note' })
  hardDelete(@Param('id') id: string) {
    return this.sampleService.hardDeleteRecordNote(id);
  }
}
