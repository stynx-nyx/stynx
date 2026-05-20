# @stynx-web/angular-profile

Angular 20 profile and preference screens for STYNX account experiences. It includes profile editing, preferences, security handoffs, hosted change-password/MFA links, and unsaved-change protection.

## Install

```bash
pnpm add @stynx-web/angular-profile
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/forms ^20.2.0`
- `@angular/router ^20.2.0`

## Use

```ts
import { profileRoutes, provideStynxProfile } from '@stynx-web/angular-profile';
import { StynxSdkClient } from '@stynx-web/sdk';

const client = new StynxSdkClient({ baseUrl: '/api', fetchFn: fetch });

bootstrapApplication(AppComponent, {
  providers: [
    // Required when using ProfileService or route-level profile data calls.
    provideStynxProfile({ clientFactory: () => client }),
  ],
});

export const routes = [{ path: 'profile', children: profileRoutes() }];
```

For component-only hosts, import `StynxProfileFormComponent`, `StynxPreferencesFormComponent`, or `StynxProfileSecurityComponent` directly. Hosts should also configure the auth, i18n, and UI packages used by the mounted screens.

## Public Surface

- Providers/routes: `provideStynxProfile`, `PROFILE_ROUTES`, `profileRoutes`.
- Components: `StynxProfileFormComponent`, `StynxPreferencesFormComponent`, `StynxProfileSecurityComponent`, `StynxChangePasswordHandoffComponent`, `StynxMfaEnrolmentHandoffComponent`.
- Services/guards/tokens: `ProfileService`, `unsavedChangesGuard`, `STYNX_PROFILE_CLIENT`.
- Types: profile, preferences, security, hosted-auth action, and unsaved-change types.
- Secondary exports: `@stynx-web/angular-profile/testing`, locale catalogs.

## See Also

- [`@stynx-web/angular-auth`](../angular-auth/README.md)
- [`@stynx-web/angular-storage`](../angular-storage/README.md)
- [Reference app dashboard demo](../../reference/web/README.md#demo-surfaces)
