import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_PERMISSION_ROUTE, STYNX_PUBLIC_ROUTE, STYNX_SYSTEM_ROUTE } from './decorators';
import { STYNX_PUBLIC_TENANT_ROUTE } from '@stynx-nyx/contracts';
import type { RequestLike } from './types';
import { hasVerifiedPrincipal } from './verified-principal';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const permission = this.reflector.getAllAndOverride<string | undefined>(
      STYNX_PERMISSION_ROUTE,
      targets,
    );
    const publicTenant = this.reflector.getAllAndOverride<boolean | object>(STYNX_PUBLIC_TENANT_ROUTE, targets);
    const publicRoute = this.reflector.getAllAndOverride<boolean>(STYNX_PUBLIC_ROUTE, targets);
    if (publicRoute && !publicTenant) return true;
    if (publicRoute && !permission) return true;
    if (!publicTenant && this.reflector.getAllAndOverride<boolean>(STYNX_SYSTEM_ROUTE, targets)) return true;
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    if (publicTenant && !hasVerifiedPrincipal(request)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
    const granted = new Set(request.principal?.permissions ?? []);
    if (!granted.has(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
    return true;
  }
}
