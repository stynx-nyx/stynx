import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthFacade } from '@core/auth/auth.facade';

export const roleGuard =
  (...roles: string[]): CanActivateFn =>
  () => {
    const auth = inject(AuthFacade);
    const lower = roles.map((role) => role.toLowerCase());
    return auth.user$.pipe(
      take(1),
      map((user) => {
        if (!user) {
          return false;
        }
        return user.roles.some((role) => lower.includes(role.toLowerCase()));
      }),
    );
  };
