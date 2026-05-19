import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { permissionDeniedPath } from './provide-auth';
import { StynxSessionService } from './session.service';
import { STYNX_ANGULAR_AUTH_OPTIONS } from './tokens';

export function stynxPermissionGuard(...permissions: string[]): CanActivateFn {
  return () => {
    const session = inject(StynxSessionService);
    const router = inject(Router);
    const options = inject(STYNX_ANGULAR_AUTH_OPTIONS);

    if (session.hasAllPermissions(permissions)) {
      return true;
    }

    return router.parseUrl(permissionDeniedPath(options));
  };
}
