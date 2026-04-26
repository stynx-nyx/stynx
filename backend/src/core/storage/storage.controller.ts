import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { NoIdempotent } from '@stynx/idempotency';
import type { Request } from 'express';
import { Audit } from '@core/audit/decorators/audit.decorator';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { TenancyGuard } from '@core/auth/guards/tenancy.guard';
import { UserGuard } from '@core/auth/guards/user.guard';
import { RegisterFileDto } from './dto/register-file.dto';
import { StorageFile, StorageService } from './storage.service';

interface RequestContext extends Request {
  tenantId?: string;
  user?: { id: string };
}

@Controller('storage/files')
@UseGuards(JwtAuthGuard, UserGuard, TenancyGuard)
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get()
  list(@Req() req: RequestContext): Promise<StorageFile[]> {
    return this.storage.listFiles(req.tenantId!);
  }

  @Audit({ action: 'upload', entity: 'storage_file' })
  @NoIdempotent()
  @Post()
  create(@Req() req: RequestContext, @Body() body: RegisterFileDto): Promise<StorageFile> {
    return this.storage.registerFile({
      tenantId: req.tenantId!,
      ownerId: req.user?.id,
      bucket: body.bucket,
      objectKey: body.objectKey,
      filename: body.filename,
      mimeType: body.mimeType,
    });
  }

  @Delete(':id')
  @Audit({ action: 'delete', entity: 'storage_file', entityIdSelector: (request) => request.params.id })
  delete(@Req() req: RequestContext, @Param('id') id: string) {
    return this.storage.markDeleted(req.tenantId!, id, req.user!.id);
  }
}
