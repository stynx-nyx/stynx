# Auth Hosted Action Contract

**Authority:** Architect (Constitution Article 6).
**Status:** Accepted for FE-C C.4.

This contract defines the auth-side surface that `@stynx-nyx/angular-profile`
uses for hosted identity-provider handoffs. It is intentionally frontend-facing:
STYNX does not standardize a backend HTTP route for these actions in v1.

## Actions

| Action key        | UI route name                      | Meaning                                                                                     |
| ----------------- | ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `change-password` | `profile.security.change-password` | Send the current user to the configured identity-provider password-change experience.       |
| `mfa-enrolment`   | `profile.security.mfa-enrolment`   | Send the current user to the configured identity-provider MFA setup or recovery experience. |

The route names are stable identifiers for analytics, tests, and host
configuration. A host may render the actions as buttons inside
`/profile/security`; it does not need separate navigable Angular routes unless
the host shell wants them.

## Frontend Interface

`@stynx-nyx/angular-auth` must expose a hosted-action capability through its
auth options and OIDC adapter rather than requiring profile components to
derive provider URLs from raw OIDC metadata.

```ts
export type StynxHostedAuthAction = 'change-password' | 'mfa-enrolment';

export interface StynxHostedAuthActionContext {
  action: StynxHostedAuthAction;
  returnUrl: string;
  state?: string;
  tenantId?: string | null;
  locale?: string | null;
}

export interface StynxHostedAuthActionLink {
  action: StynxHostedAuthAction;
  url: string;
  method: 'browser-redirect';
  opensIn?: 'same-tab' | 'new-tab';
}

export type StynxHostedAuthActionUrlBuilder = (
  context: StynxHostedAuthActionContext,
) => string | StynxHostedAuthActionLink | null;

export interface StynxHostedAuthActionOptions {
  returnUrl?: string;
  changePassword?: string | StynxHostedAuthActionUrlBuilder;
  mfaEnrolment?: string | StynxHostedAuthActionUrlBuilder;
}
```

`StynxAngularAuthModuleOptions` must accept:

```ts
hostedActions?: StynxHostedAuthActionOptions;
```

`StynxOidcAdapter` must expose:

```ts
getHostedActionLink(action: StynxHostedAuthAction, context?: Partial<StynxHostedAuthActionContext>): StynxHostedAuthActionLink | null;
openHostedAction(action: StynxHostedAuthAction, context?: Partial<StynxHostedAuthActionContext>): void;
```

`mfaEnrolment` is camel-case in TypeScript options because the existing package
uses TypeScript identifiers. The stable action key remains `mfa-enrolment`.

## URL Resolution

The adapter resolves links in this order:

1. Action-specific builder or URL from `hostedActions.changePassword` or
   `hostedActions.mfaEnrolment`.
2. Host-provided `hostedActions.returnUrl`.
3. Current browser URL without the identity-provider callback query/hash.

Static URL strings may contain these placeholders:

| Placeholder   | Value                                       |
| ------------- | ------------------------------------------- |
| `{returnUrl}` | URL-encoded return URL.                     |
| `{state}`     | URL-encoded caller state, if provided.      |
| `{tenantId}`  | URL-encoded active tenant id, if available. |
| `{locale}`    | URL-encoded active locale, if available.    |

The default adapter must not guess provider-specific action URLs from
`authority`, `redirectUrl`, or Cognito host names. Cognito, Auth0, Azure AD B2C,
or custom IdPs each model password and MFA actions differently; STYNX requires
an explicit configured URL or builder for these handoffs.

## Tenancy

Hosted identity-provider actions are user-account actions, not tenant data
mutations. The active tenant id may be included in the action context so the host
can return the user to the right tenant shell, but the provider URL must not be
treated as a source of tenant authorization.

On return, normal STYNX auth/session code revalidates the session, permissions,
and tenant context. Profile components must not persist tenant changes based on
hosted-action callback parameters.

## Permissions

No STYNX backend permission is required to render a hosted action link. The user
must already have an authenticated session. Host applications may additionally
hide the actions behind local UI policy, but that policy is advisory; provider
authorization remains the identity provider's responsibility.

## Error Semantics

| Condition                                | Component behavior                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Action URL not configured                | Disable or hide the action and expose a nonfatal configuration error for tests and diagnostics.    |
| Builder returns `null`                   | Treat the action as unavailable for the current user/context.                                      |
| Builder throws or returns an invalid URL | Show the standard error banner with code `AUTH:CONFIG:hosted-action-url`.                          |
| Provider callback returns an error       | Preserve the provider error in route state, re-run `checkAuth`, and show a sanitized error banner. |

Errors are frontend configuration/runtime errors. They do not mint new backend
HTTP error codes unless a future backend-mediated handoff route is introduced.

## Engineer Guidance

- Implement the contract in `@stynx-nyx/angular-auth`; `@stynx-nyx/angular-profile`
  consumes only the adapter/provider surface.
- Keep the two profile handoff components thin: resolve the link, open it, and
  render configured unavailable/error states.
- Do not import provider-specific SDKs into `@stynx-nyx/angular-profile`.
- Add unit tests for configured URL strings, builder functions, unavailable
  actions, placeholder encoding, and return URL fallback.
