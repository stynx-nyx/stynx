import { Body, Controller, Delete, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Permission, ReadOnly, StynxAuthGuard, PermissionGuard } from '@stynx-nyx/auth';
import { Idempotent } from '@stynx-nyx/idempotency';
import { RateLimit } from '@stynx-nyx/ratelimit';
import { Audit } from '@stynx-nyx/backend';
import type { CompleteDocumentDto, CreateDocumentDto } from './dto';
import { ReferenceSampleService } from './reference-sample.service';

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function documentWriteRateLimit(scope: string) {
  return {
    bucket: 'tenant' as const,
    scope,
    cost: 2,
    limit: envNumber('STYNX_SAMPLE_DOCUMENT_WRITE_LIMIT', 20),
    windowSeconds: envNumber('STYNX_SAMPLE_DOCUMENT_WRITE_WINDOW_SECONDS', 60),
  };
}

@Controller('/documents')
@UseGuards(StynxAuthGuard, PermissionGuard)
export class DocumentsController {
  constructor(private readonly sampleService: ReferenceSampleService) {}

  @Post()
  @Permission('sample:document:write')
  @Idempotent()
  @RateLimit(documentWriteRateLimit('sample.documents.create'))
  @Audit({ action: 'sample.document.create', entity: 'storage.documents' })
  async create(@Body() body: CreateDocumentDto, @Res({ passthrough: true }) response: ResponseLike) {
    const startedAt = performance.now();
    const result = await this.sampleService.createDocument(body);
    response.setHeader('X-Stynx-Storage-Presign-Ms', (performance.now() - startedAt).toFixed(3));
    return result;
  }

  @Post('/:id/complete')
  @Permission('sample:document:write')
  @Idempotent()
  @RateLimit(documentWriteRateLimit('sample.documents.complete'))
  @Audit({ action: 'sample.document.complete', entity: 'storage.documents' })
  complete(@Param('id') id: string, @Body() body: CompleteDocumentDto) {
    return this.sampleService.completeDocument(id, body);
  }

  @Get('/:id/download')
  @ReadOnly()
  @Permission('sample:document:read')
  @RateLimit({ bucket: 'tenant', scope: 'sample.documents.download', cost: 1, limit: 30, windowSeconds: 60 })
  @Audit({ action: 'sample.document.download', entity: 'storage.documents' })
  download(@Param('id') id: string) {
    return this.sampleService.getDocumentDownload(id);
  }

  @Delete('/:id')
  @Permission('sample:document:delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.documents.delete', cost: 2, limit: 20, windowSeconds: 60 })
  @Audit({ action: 'sample.document.soft-delete', entity: 'storage.documents' })
  delete(@Param('id') id: string) {
    return this.sampleService.softDeleteDocument(id);
  }

  @Post('/:id/restore')
  @Permission('sample:document:restore')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.documents.restore', cost: 2, limit: 20, windowSeconds: 60 })
  @Audit({ action: 'sample.document.restore', entity: 'storage.documents' })
  restore(@Param('id') id: string) {
    return this.sampleService.restoreDocument(id);
  }

  @Delete('/:id/hard')
  @Permission('sample:document:hard-delete')
  @Idempotent()
  @RateLimit({ bucket: 'tenant', scope: 'sample.documents.hard-delete', cost: 5, limit: 10, windowSeconds: 60 })
  @Audit({ action: 'sample.document.hard-delete', entity: 'storage.documents' })
  hardDelete(@Param('id') id: string) {
    return this.sampleService.hardDeleteDocument(id);
  }
}
