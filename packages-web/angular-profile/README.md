# `@stynx-nyx/angular-profile` — Angular user-profile UI: edit, preferences, security, hosted-action handoff

`@stynx-nyx/angular-profile` is the Angular user-profile package. It provides profile-edit, preferences-form, and profile-security components, a hosted-auth-action handoff component (for IdP-hosted flows like password change / MFA), an unsaved-changes route guard, a `ProfileService`, and ready-to-mount routes. The security + account-deletion flows tie into the backend's [`@stynx-nyx/privacy`](/docs/packages/privacy/) subject-rights endpoints.

## Purpose

Apps need a "my account" area: edit profile, set preferences, change password / manage MFA, request account deletion. Building these per app is repetitive and the security flows are easy to get wrong. `@stynx-nyx/angular-profile` provides them with the IdP handoff + subject-rights integration handled.

You reach for it when your app has a user account / settings area.

What it does NOT do: it doesn't authenticate (that's `@stynx-nyx/angular-auth`). It doesn't perform the actual erasure (the backend `@stynx-nyx/privacy` does; this initiates the request).

## Audience

Angular frontend developers building account-settings screens.

## Install

```bash
pnpm add @stynx-nyx/angular-profile
```

**Peer dependencies:** `@angular/core` `^18`, `@angular/router` `^18`, `@angular/forms` `^18`, `@stynx-nyx/angular` `^1`, `@stynx-nyx/angular-auth` `^1`.

## Quick start

```ts
import { provideProfile, profileRoutes } from '@stynx-nyx/angular-profile';

export const appConfig = { providers: [provideProfile()] };

export const routes: Routes = [
  { path: 'account', children: profileRoutes, canActivate: [authGuard] },
];
```

## Public API surface

### Providers + routes

| Export           | Description                                             |
| ---------------- | ------------------------------------------------------- |
| `provideProfile` | Registers the profile service + component dependencies. |
| `profileRoutes`  | Ready-to-mount child routes for the account area.       |

### Components

| Selector                             | Component                          | Description                                                               |
| ------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------- |
| `<stynx-profile-form>`               | `ProfileFormComponent`             | Edit profile fields (name, email, avatar).                                |
| `<stynx-preferences-form>`           | `PreferencesFormComponent`         | User preferences (locale, notifications).                                 |
| `<stynx-profile-security>`           | `ProfileSecurityComponent`         | Security settings; entry point for password change + account deletion.    |
| `<stynx-hosted-auth-action-handoff>` | `HostedAuthActionHandoffComponent` | Redirects to the IdP-hosted flow for password change / MFA, then returns. |

### Guards

| Export                | Description                                                       |
| --------------------- | ----------------------------------------------------------------- |
| `unsavedChangesGuard` | `CanDeactivate` — warns before navigating away from a dirty form. |

### Services

| Export           | Description                                                                    |
| ---------------- | ------------------------------------------------------------------------------ |
| `ProfileService` | Read/update profile + preferences; initiate account-deletion (subject-rights). |

### Types

| Export  | Description                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------ |
| (types) | Profile + preferences view-model types. See [TypeDoc](/docs/api-reference/stynx-web-angular-profile/). |

## Configuration

| Option                  | Type      | Default            | Description                                    |
| ----------------------- | --------- | ------------------ | ---------------------------------------------- |
| `hostedActionUrl`       | `string`  | (from auth config) | IdP-hosted action base URL.                    |
| `enableAccountDeletion` | `boolean` | `true`             | Show the subject-rights account-deletion flow. |

## Examples

### Example 1 — account area with unsaved-changes guard

```ts
{ path: 'account/profile', component: ProfilePage, canDeactivate: [unsavedChangesGuard] }
```

### Example 2 — security page

```html
<stynx-profile-security />
```

### Example 3 — account deletion (subject-rights)

```ts
import { ProfileService } from '@stynx-nyx/angular-profile';

@Component({
  /* ... */
})
export class DeleteAccount {
  private readonly profile = inject(ProfileService);
  async confirmDelete() {
    await this.profile.requestAccountDeletion(); // hits @stynx-nyx/privacy erasure endpoint
  }
}
```

## Common pitfalls

- **Account-deletion without backend privacy module** — `requestAccountDeletion()` calls the `@stynx-nyx/privacy` subject-rights endpoint; if that module isn't mounted server-side, it 404s.
- **Hosted-action handoff redirect loop** — misconfigured return URL bounces the user. Ensure `hostedActionUrl` + return URI are registered with the IdP.
- **Unsaved-changes guard on a multi-step form** — the guard fires on any navigation; for wizards, suppress it between steps.

## Related packages

- [`@stynx-nyx/angular-auth`](/docs/packages-web/angular-auth/) — auth + the IdP the hosted-action handoff uses.
- [`@stynx-nyx/privacy`](/docs/packages/privacy/) — the backend subject-rights endpoints (account deletion).

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-profile/`](/docs/api-reference/stynx-web-angular-profile/)

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/angular`: `workspace:*`
- `@stynx-nyx/angular-auth`: `workspace:*`
- `@stynx-nyx/angular-i18n`: `workspace:*`
- `@stynx-nyx/angular-storage`: `workspace:*`
- `@stynx-nyx/angular-ui`: `workspace:*`
- `@stynx-nyx/sdk`: `workspace:*`
- `rxjs`: `^7.8.2`

### Optional dependencies

_None._

### Peer dependencies

- `@angular/common`: `>=20.3.0 <22`
- `@angular/core`: `>=20.3.0 <22`
- `@angular/forms`: `>=20.3.0 <22`
- `@angular/router`: `>=20.3.0 <22`

### Development-only dependencies

- `@angular/common`: `21.2.19`
- `@angular/compiler`: `21.2.19`
- `@angular/compiler-cli`: `21.2.19`
- `@angular/core`: `21.2.19`
- `@angular/forms`: `21.2.19`
- `@angular/platform-browser`: `21.2.19`
- `@angular/router`: `21.2.19`
- `@stynx-nyx/sdk`: `workspace:*`
- `@types/node`: `24.12.4`
- `jsdom`: `^29.0.2`
- `ng-packagr`: `21.2.3`
- `tslib`: `^2.8.1`
- `typescript`: `5.9.3`

<!-- stynx:generated-dependencies:end -->
