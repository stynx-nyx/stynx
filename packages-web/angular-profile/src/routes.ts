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
  const cloned: Route = { ...route };
  if (route.canDeactivate) {
    cloned.canDeactivate = [...route.canDeactivate];
  }
  if (route.data) {
    cloned.data = { ...route.data };
  }
  return cloned;
}

export function profileRoutes(): Routes {
  return PROFILE_ROUTES.map(cloneRoute);
}
