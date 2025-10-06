import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuditRequest } from '@core/audit/decorators/audit.decorator';
import type { Request } from 'express';
import { Audit } from '@core/audit/decorators/audit.decorator';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { TenancyGuard } from '@core/auth/guards/tenancy.guard';
import { UserGuard } from '@core/auth/guards/user.guard';
import { CognitoSyncService } from '@core/auth/cognito-sync.service';
import { UsersService, UserSummary } from './users.service';

interface RequestWithContext extends Request {
  tenantId?: string;
  user?: { id: string };
}

@Controller('users')
@UseGuards(JwtAuthGuard, UserGuard)
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly cognito: CognitoSyncService,
  ) {}

  @Get()
  @UseGuards(TenancyGuard)
  async list(@Req() req: RequestWithContext): Promise<UserSummary[]> {
    return this.users.listByTenancy(req.tenantId!);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<UserSummary | null> {
    return this.users.findOne(id);
  }

  @Post(':id/sync')
  @Audit({
    action: 'sync',
    entity: 'user',
    entityIdSelector: (request: AuditRequest) => request.params?.id,
  })
  async sync(@Param('id') id: string): Promise<{ status: 'queued' }> {
    await this.cognito.enqueueSync(id);
    return { status: 'queued' };
  }
}
