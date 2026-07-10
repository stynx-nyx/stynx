import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { STYNX_ANGULAR_AUTH_OPTIONS, StynxSessionService } from '@stynx-nyx/angular-auth';
import { describe, expect, it } from 'vitest';
import { StynxGroupDetailComponent } from '../../src/group-detail.component';
import { StynxGroupsAdminComponent } from '../../src/groups-admin.component';
import { StynxRoleDetailComponent } from '../../src/role-detail.component';
import { StynxRolesAdminComponent } from '../../src/roles-admin.component';
import { iamRoutes } from '../../src/routes';
import { StynxUserDetailComponent } from '../../src/user-detail.component';
import { StynxUsersAdminComponent } from '../../src/users-admin.component';
import { renderComponent } from '../support/test-bed';

@Component({
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RouteHostComponent {}

@Component({
  standalone: true,
  template: '<p>permission denied</p>',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ForbiddenComponent {}

function activatedComponent(router: Router): unknown {
  let route = router.routerState.snapshot.root;
  while (route.firstChild) {
    route = route.firstChild;
  }
  return route.routeConfig?.component;
}

describe('angular-iam routes', () => {
  it('activates each IAM admin route for users, roles, and groups when permissions allow', async () => {
    const fixture = await renderComponent(RouteHostComponent, {
      providers: [
        provideRouter([
          { path: 'forbidden', component: ForbiddenComponent },
          { path: '', children: iamRoutes() },
        ]),
        { provide: StynxSessionService, useValue: { hasAllPermissions: () => true } },
        { provide: STYNX_ANGULAR_AUTH_OPTIONS, useValue: { permissionDeniedRoute: '/forbidden' } },
      ],
    });
    const router = TestBed.inject(Router);

    for (const [url, expectedComponent] of [
      ['/users', StynxUsersAdminComponent],
      ['/users/user-1', StynxUserDetailComponent],
      ['/roles', StynxRolesAdminComponent],
      ['/roles/role-1', StynxRoleDetailComponent],
      ['/groups', StynxGroupsAdminComponent],
      ['/groups/group-1', StynxGroupDetailComponent],
    ] as const) {
      await router.navigateByUrl(url);
      await fixture.whenStable();
      fixture.detectChanges();
      expect(router.url).toBe(url);
      expect(activatedComponent(router)).toBe(expectedComponent);
    }
  });

  it('redirects denied IAM route activation to the configured permission-denied route', async () => {
    const fixture = await renderComponent(RouteHostComponent, {
      providers: [
        provideRouter([
          { path: 'forbidden', component: ForbiddenComponent },
          { path: '', children: iamRoutes() },
        ]),
        { provide: StynxSessionService, useValue: { hasAllPermissions: () => false } },
        { provide: STYNX_ANGULAR_AUTH_OPTIONS, useValue: { permissionDeniedRoute: '/forbidden' } },
      ],
    });
    const router = TestBed.inject(Router);

    await router.navigateByUrl('/users');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/forbidden');
    expect(fixture.nativeElement.textContent).toContain('permission denied');
  });
});
