import { Injectable } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { POLICY_RULES, ROLES } from './policy.config';

// Replace with real auth/role service from @doit/framework-ui
@Injectable({ providedIn: 'root' })
export class __MODULE__PolicyService {
  hasAccess(resource: string, action: string, user?: { roles?: string[]; attrs?: Record<string, unknown> }): boolean {
    // TODO: inject real auth service to get user details
    const roles = new Set((user?.roles ?? []).map((r) => String(r).toLowerCase()));
    const rule = POLICY_RULES.find((r) => r.resource === resource && r.actions.includes(action));
    if (!rule) return true; // no rule → allow
    if (ROLES.length === 0) return true;
    return [...roles].some((r) => ROLES.includes(r));
  }
}

export const __MODULE__PolicyGuard: CanActivateFn = (route) => {
  const svc = route.injector.get(__MODULE__PolicyService);
  const router = route.injector.get(Router);
  const resource = (route.data && (route.data['resource'] as string)) || 'resource';
  const action = (route.data && (route.data['action'] as string)) || 'read';
  const ok = svc.hasAccess(resource, action);
  if (ok) return true;
  router.navigateByUrl('/');
  return false;
};
