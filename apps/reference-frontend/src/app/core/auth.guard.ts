import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { ReferenceAuthFacade } from './reference-auth.facade';

export const referenceAuthGuard: CanActivateFn = () => {
  const auth = inject(ReferenceAuthFacade);
  const router = inject(Router);

  return auth.principal$.pipe(
    take(1),
    map((principal) => {
      if (principal) {
        return true;
      }
      void router.navigate(['/login']);
      return false;
    }),
  );
};
