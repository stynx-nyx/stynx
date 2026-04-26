import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_PERMISSION_ROUTE, STYNX_PUBLIC_ROUTE, STYNX_SYSTEM_ROUTE } from './decorators';
import type { RequestLike } from './types';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(STYNX_PUBLIC_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }
    if (this.reflector.getAllAndOverride<boolean>(STYNX_SYSTEM_ROUTE, [context.getHandler(), context.getClass()])) {
      return true;
    }

    const permission = this.reflector.getAllAndOverride<string | undefined>(
      STYNX_PERMISSION_ROUTE,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestLike>();
    const granted = new Set(request.principal?.permissions ?? []);
    if (!granted.has(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
    return true;
  }
}
