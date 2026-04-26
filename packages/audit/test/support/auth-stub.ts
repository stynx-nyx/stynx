import { CanActivate, Injectable, SetMetadata } from '@nestjs/common';

@Injectable()
export class StynxAuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@Injectable()
export class PermissionGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

export function Permission(key: string) {
  return SetMetadata('stynx:required_permission', key);
}
