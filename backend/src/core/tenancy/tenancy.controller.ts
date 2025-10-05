import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Audit } from '@core/audit/decorators/audit.decorator';
import { RequireRoles } from '@core/auth/decorators/roles.decorator';
import { JwtAuthGuard } from '@core/auth/guards/jwt-auth.guard';
import { RoleGuard } from '@core/auth/guards/role.guard';
import { UserGuard } from '@core/auth/guards/user.guard';
import { CreateTenancyDto } from './dto/create-tenancy.dto';
import { TenancyDto, TenancyService } from './tenancy.service';

interface RequestWithUser extends Request {
  user?: { id: string };
}

@Controller('tenancies')
@UseGuards(JwtAuthGuard, UserGuard)
export class TenancyController {
  constructor(private readonly service: TenancyService) {}

  @Get()
  async list(@Req() req: RequestWithUser): Promise<TenancyDto[]> {
    return this.service.listForUser(req.user!.id);
  }

  @Post()
  @UseGuards(RoleGuard)
  @RequireRoles('platform:admin', 'platform:superadmin')
  @Audit({ action: 'create', entity: 'tenancy' })
  async create(
    @Req() req: RequestWithUser,
    @Body() body: CreateTenancyDto,
  ): Promise<TenancyDto> {
    return this.service.createTenancy({
      code: body.code,
      name: body.name,
      actorId: req.user!.id,
    });
  }
}
