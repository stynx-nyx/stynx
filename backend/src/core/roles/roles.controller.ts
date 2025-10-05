import {
  Body,
  Controller,
  Get,
  Param,
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
import { CreateRoleDto } from './dto/create-role.dto';
import { RolesService } from './roles.service';

interface RequestWithUser extends Request {
  user?: { id: string };
}

@Controller('roles')
@UseGuards(JwtAuthGuard, UserGuard, RoleGuard)
@RequireRoles('platform:admin', 'platform:superadmin')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  list() {
    return this.roles.list();
  }

  @Post()
  @Audit({ action: 'create', entity: 'role' })
  create(@Req() req: RequestWithUser, @Body() body: CreateRoleDto) {
    return this.roles.create({
      code: body.code,
      name: body.name,
      description: body.description,
      actorId: req.user!.id,
    });
  }

  @Post(':code/assign/:userId')
  @Audit({
    action: 'assign',
    entity: 'role',
    entityIdSelector: (request) => request.params.code,
    detailsSelector: (request) => ({ userId: request.params.userId }),
  })
  assign(
    @Req() req: RequestWithUser,
    @Param('code') code: string,
    @Param('userId') userId: string,
  ) {
    return this.roles.assignRole({ roleCode: code, userId, actorId: req.user!.id });
  }
}
