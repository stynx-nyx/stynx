import { CanActivate, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { STYNX_HEALTH_OPTIONS, type StynxHealthModuleOptions } from './tokens';

@Injectable()
export class StynxPlatformInfoGuard implements CanActivate {
  constructor(
    @Inject(STYNX_HEALTH_OPTIONS)
    private readonly options: StynxHealthModuleOptions,
  ) {}

  canActivate(): boolean {
    const flag = this.options.infoFlagEnvVar ?? 'STYNX_PLATFORM_INFO_ENABLED';
    if (process.env[flag] !== 'true') {
      throw new ForbiddenException('Platform info endpoint is disabled');
    }
    return true;
  }
}
