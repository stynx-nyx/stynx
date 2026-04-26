import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef, Reflector } from '@nestjs/core';
import { SessionService } from '@stynx/sessions';
import { PermissionCache } from './permission-cache';
import { StynxJwtValidator } from './stynx-jwt.validator';
import { STYNX_PUBLIC_ROUTE, STYNX_READONLY_ROUTE, STYNX_SYSTEM_ROUTE } from './decorators';
import type { RequestLike } from './types';
import { headerToString } from './utils';

function responseLike(request: RequestLike): { setHeader(name: string, value: string): void } | null {
  const candidate = (request.res ?? request.response) as { setHeader?: (name: string, value: string) => void } | undefined;
  if (!candidate?.setHeader) {
    return null;
  }
  return {
    setHeader: candidate.setHeader.bind(candidate),
  };
}

@Injectable()
export class StynxAuthGuard implements CanActivate {
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly reflector: Reflector,
    private readonly validator: StynxJwtValidator,
    private readonly permissionCache: PermissionCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(STYNX_PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(STYNX_SYSTEM_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const response = responseLike(request);
    const startedAt = performance.now();
    const authorization = headerToString(request.headers.authorization);
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing STYNX bearer token');
    }
    const token = authorization.slice('Bearer '.length).trim();
    const claims = await this.validator.validate(token);
    const sessionService = this.moduleRef.get(SessionService, { strict: false });
    if (sessionService) {
      const session = await sessionService.get(claims.sid);
      if (!session) {
        throw new UnauthorizedException('STYNX session is no longer active');
      }
    }
    const permissions = await this.permissionCache.getForSession(claims);

    request.stynxClaims = claims;
    request.tenantId = claims.tenantId;
    request.stynxReadonly = Boolean(
      this.reflector.getAllAndOverride<boolean>(STYNX_READONLY_ROUTE, [context.getHandler(), context.getClass()]),
    );
    request.principal = {
      id: claims.sub,
      roles: [],
      permissions: permissions.permissions,
      tenants: [claims.tenantId],
      claims: claims.claims,
    };
    request.user = {
      id: claims.sub,
      permissions: permissions.permissions,
      tenants: [claims.tenantId],
      claims: claims.claims,
    };
    request.actor = request.user;
    response?.setHeader('X-Stynx-Auth-Verify-Ms', (performance.now() - startedAt).toFixed(3));
    return true;
  }
}
