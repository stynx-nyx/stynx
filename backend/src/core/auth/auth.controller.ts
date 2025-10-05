import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserGuard } from './guards/user.guard';

interface RequestWithUser extends Request {
  user?: { id: string; roles: string[]; tenants?: string[] };
  tenantId?: string;
}

@Controller('auth')
@UseGuards(JwtAuthGuard, UserGuard)
export class AuthController {
  @Get('me')
  me(@Req() req: RequestWithUser) {
    return {
      id: req.user!.id,
      roles: req.user!.roles,
      tenants: req.user!.tenants ?? [],
      tenantId: req.tenantId ?? null,
    };
  }
}
