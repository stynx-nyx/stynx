import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class TenancyPlatformAdminGuard implements CanActivate {
  canActivate(): boolean {
    if (process.env.STYNX_TENANCY_PLATFORM_ADMIN === 'true') {
      return true;
    }
    throw new ForbiddenException('PLATFORM_ADMIN_DISABLED');
  }
}
