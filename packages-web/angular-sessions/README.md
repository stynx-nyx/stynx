# `@stynx-web/angular-sessions` — Angular UI for active sessions + remote logout

`@stynx-web/angular-sessions` is the Angular session-management UI. It provides an `<stynx-active-sessions>` component that lists the user's active sessions (device, location, last-seen) with a "revoke" action for logging out other devices. Backed by the SDK's session endpoints, paired with the backend's [`@stynx-nyx/sessions`](/docs/packages/sessions/).

## Purpose

Security-conscious apps let users see + revoke their active sessions ("you're logged in on 3 devices — sign out the others"). `@stynx-web/angular-sessions` provides that surface ready-made.

You reach for it when your app has an account-security area.

What it does NOT do: it doesn't create sessions (login does, via `@stynx-web/angular-auth`). It only lists + revokes.

## Audience

Angular frontend developers building account-security screens.

## Install

```bash
pnpm add @stynx-web/angular-sessions
```

**Peer dependencies:** `@angular/core` `^18`, `@stynx-web/angular` `^1`, `@stynx-web/angular-auth` `^1`, `@stynx-web/sdk` `^1`.

## Quick start

```ts
import { provideSessions } from '@stynx-web/angular-sessions';

export const appConfig = { providers: [provideSessions()] };
```

```html
<stynx-active-sessions />
```

## Public API surface

### Providers

| Export            | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `provideSessions` | Registers the sessions adapter + component dependencies. |

### Components

| Selector                  | Component                 | Description                                                                |
| ------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| `<stynx-active-sessions>` | `ActiveSessionsComponent` | Lists active sessions with revoke actions. Highlights the current session. |

### Services

| Export               | Description                                     |
| -------------------- | ----------------------------------------------- |
| `SdkSessionsAdapter` | Wraps the SDK's session list/revoke operations. |

### Types

| Export  | Description                                                                               |
| ------- | ----------------------------------------------------------------------------------------- |
| (types) | Session view-model types. See [TypeDoc](/docs/api-reference/stynx-web-angular-sessions/). |

## Configuration

| Option          | Type      | Default | Description                               |
| --------------- | --------- | ------- | ----------------------------------------- |
| `showLocation`  | `boolean` | `true`  | Display approximate location per session. |
| `confirmRevoke` | `boolean` | `true`  | Require confirmation before revoking.     |

## Examples

### Example 1 — account-security page

```html
<section>
  <h2>Active sessions</h2>
  <stynx-active-sessions />
</section>
```

### Example 2 — without location display

```html
<stynx-active-sessions [showLocation]="false" />
```

## Common pitfalls

- **Backend session store is in-memory across instances** — revoking a session on one instance may not propagate. Ensure the backend uses the Redis session store in production (see [`@stynx-nyx/sessions`](/docs/packages/sessions/)).
- **Revoking the current session** — the component highlights the current session; revoking it logs the user out immediately. Confirm intent.

## Related packages

- [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth/) — session creation + auth state.
- [`@stynx-nyx/sessions`](/docs/packages/sessions/) — the backend counterpart.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-sessions/`](/docs/api-reference/stynx-web-angular-sessions/)
