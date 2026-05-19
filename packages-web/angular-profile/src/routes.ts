import type { Route, Routes } from '@angular/router';
import { StynxPreferencesFormComponent } from './preferences-form.component';
import { StynxProfileSecurityComponent } from './profile-security.component';
import { StynxProfileFormComponent } from './profile-form.component';
import { unsavedChangesGuard } from './unsaved-changes.guard';

export const PROFILE_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: StynxProfileFormComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { titleKey: 'profile.routes.profile' },
  },
  {
    path: 'preferences',
    component: StynxPreferencesFormComponent,
    canDeactivate: [unsavedChangesGuard],
    data: { titleKey: 'profile.routes.preferences' },
  },
  {
    path: 'security',
    component: StynxProfileSecurityComponent,
    data: { titleKey: 'profile.routes.security' },
  },
];

function cloneRoute(route: Route): Route {
  return {
    ...route,
    canDeactivate: route.canDeactivate ? [...route.canDeactivate] : undefined,
    data: route.data ? { ...route.data } : undefined,
  };
}

export function profileRoutes(): Routes {
  return PROFILE_ROUTES.map(cloneRoute);
}
