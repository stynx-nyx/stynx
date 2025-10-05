import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthFacade } from '@core/auth/auth.facade';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthFacade);
  const router = inject(Router);
  return auth.user$.pipe(
    take(1),
    map((user) => {
      if (user) {
        return true;
      }
      router.navigate(['/login']);
      return false;
    }),
  );
};
