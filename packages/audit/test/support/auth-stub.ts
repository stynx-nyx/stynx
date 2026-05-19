import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';

const STYNX_PERMISSION_ROUTE = Symbol('STYNX_PERMISSION_ROUTE');

function requiredPermission(context: ExecutionContext): string | undefined {
  for (const target of [context.getHandler(), context.getClass()]) {
    const permission = Reflect.getMetadata(STYNX_PERMISSION_ROUTE, target) as string | undefined;
    if (permission) {
      return permission;
    }
  }
  return undefined;
}

function parsePermissions(token: string): string[] {
  if (token === 'audit-reader') {
    return ['platform:audit:read:*'];
  }
  if (token === 'viewer') {
    return [];
  }
  return token.split(',').map((permission) => permission.trim()).filter(Boolean);
}

@Injectable()
export class StynxAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string | string[] };
      principal?: { id: string; permissions: string[] };
      user?: { id: string; permissions: string[] };
    }>();
    const raw = Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0]
      : request.headers.authorization;
    if (!raw?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing STYNX bearer token');
    }
    const token = raw.slice('Bearer '.length).trim();
    const permissions = parsePermissions(token);
    request.principal = { id: 'test-user', permissions };
    request.user = { id: 'test-user', permissions };
    return true;
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const permission = requiredPermission(context);
    if (!permission) {
      return true;
    }
    const request = context.switchToHttp().getRequest<{
      principal?: { permissions?: string[] };
    }>();
    if (!request.principal?.permissions?.includes(permission)) {
      throw new ForbiddenException(`Missing permission ${permission}`);
    }
    return true;
  }
}

export function Permission(key: string) {
  return SetMetadata(STYNX_PERMISSION_ROUTE, key);
}
