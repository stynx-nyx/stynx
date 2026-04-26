import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { NoIdempotent } from '@stynx/idempotency';
import { Permission, Public } from './decorators';
import { PermissionGuard } from './permission.guard';
import { StynxAuthGuard } from './stynx-auth.guard';
import { StynxAuthService } from './auth.service';
import type { RequestLike } from './types';
import { headerToString } from './utils';

export interface SessionExchangeBody {
  cognitoToken?: string;
  deviceMeta?: Record<string, unknown>;
}

export interface SessionSwitchBody {
  tenantId?: string;
  deviceMeta?: Record<string, unknown>;
}

@Controller()
export class StynxAuthController {
  constructor(private readonly authService: StynxAuthService) {}

  @Public()
  @NoIdempotent()
  @Post('/sessions')
  async createSession(
    @Body() body: SessionExchangeBody,
    @Headers('x-tenant-id') tenantHeader: string | string[] | undefined,
  ) {
    const tenantId = headerToString(tenantHeader);
    if (!tenantId) {
      throw new ForbiddenException('TENANT_ACCESS_DENIED');
    }
    if (!body.cognitoToken) {
      throw new UnauthorizedException('Missing Cognito bearer token');
    }
    return this.authService.exchangeCognitoToken(body.cognitoToken, tenantId, body.deviceMeta ?? {});
  }

  @UseGuards(StynxAuthGuard)
  @NoIdempotent()
  @Post('/sessions/switch')
  async switchSession(
    @Req() request: RequestLike,
    @Body() body: SessionSwitchBody,
    @Headers('x-tenant-id') tenantHeader: string | string[] | undefined,
  ) {
    const tenantId = body.tenantId ?? headerToString(tenantHeader);
    if (!tenantId || !request.stynxClaims) {
      throw new ForbiddenException('TENANT_ACCESS_DENIED');
    }
    return this.authService.switchTenant(
      {
        sid: request.stynxClaims.sid,
        sub: request.stynxClaims.sub,
        ...(request.stynxClaims.cognitoSub !== undefined
          ? { cognitoSub: request.stynxClaims.cognitoSub }
          : {}),
      },
      tenantId,
      body.deviceMeta ?? {},
    );
  }

  @UseGuards(StynxAuthGuard)
  @NoIdempotent()
  @Post('/sessions/logout')
  async logout(@Req() request: RequestLike) {
    if (!request.stynxClaims) {
      throw new UnauthorizedException('Missing STYNX access token');
    }
    await this.authService.logout(request.stynxClaims.sid);
    return { status: 'ok' };
  }

  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('platform:perms:inspect:*')
  @Get('/_platform/perms/:sid')
  inspect(@Param('sid') sid: string) {
    return this.authService.inspectPermissions(sid);
  }

  @UseGuards(StynxAuthGuard, PermissionGuard)
  @Permission('platform:perms:invalidate:*')
  @NoIdempotent()
  @Post('/_platform/perms/:sid/invalidate')
  async invalidate(@Param('sid') sid: string) {
    await this.authService.invalidatePermissions(sid);
    return { status: 'ok' };
  }
}
