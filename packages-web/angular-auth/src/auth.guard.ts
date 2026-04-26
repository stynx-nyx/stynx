import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { StynxSessionService } from './session.service';
import { STYNX_ANGULAR_AUTH_OPTIONS } from './tokens';

export const stynxAuthGuard: CanActivateFn = () => {
  const session = inject(StynxSessionService);
  const router = inject(Router);
  const options = inject(STYNX_ANGULAR_AUTH_OPTIONS);

  if (session.snapshot().active) {
    return true;
  }

  return router.parseUrl(options.loginRedirectRoute ?? '/login');
};
