# `@stynx-web/sdk` — the generated TypeScript REST client for the STYNX backend

`@stynx-web/sdk` is the TypeScript client for STYNX's REST surface. The bulk of it — the per-operation methods + DTO types — is **auto-generated** from the backend's OpenAPI contract (`@stynx/flow` and the other `@Controller`-carrying packages). On top of the generated core, it adds hand-authored helpers: an auth provider, a session manager, token store, tenant provider, JWT helpers, and a configurable transport. Used by every `@stynx-web/*` package to call the backend.

> **This README is a navigation page, not a symbol catalog.** The SDK has 700+ exports across 250+ files, almost all generated. Enumerating them here would be noise and would go stale on every regeneration. For symbol-level reference use the [TypeDoc](/docs/api-reference/stynx-web-sdk/). The sections below describe the SDK's _shape_ and how to _use_ it.

## Purpose

A frontend talking to the STYNX backend needs a typed client: every endpoint as a method, every DTO as a type, with auth + tenant + error handling threaded through. Hand-writing this drifts from the backend; generating it from the OpenAPI contract keeps it in lockstep. `@stynx-web/sdk` is that generated client plus the auth/session/transport glue the generation can't express.

You reach for it indirectly — `@stynx-web/angular` wires it, and the other `@stynx-web/*` packages consume it. You call it directly when writing a component that hits a backend endpoint.

What it does NOT do: it's not Angular-specific (it's framework-agnostic TypeScript; `@stynx-web/angular` adapts it to Angular DI). It doesn't manage UI state.

## Audience

Angular frontend developers calling the STYNX backend. Most interaction is through generated operation methods + the auth/session helpers.

## Install

```bash
pnpm add @stynx-web/sdk
```

**Peer dependencies:** none required for the core client; `@stynx-web/angular` adapts it to Angular DI.

## Quick start

```ts
import { OpenAPI } from '@stynx-web/sdk';
// Set the base URL (usually done for you by provideStynxAngular)
OpenAPI.BASE = 'https://api.example.com';

// Call a generated operation
import { FlowService } from '@stynx-web/sdk';
const forms = await FlowService.listForms();
```

In an Angular app you rarely set `OpenAPI.BASE` yourself — `provideStynxAngular({ apiBaseUrl })` does it.

## Public API surface

**Generated (from OpenAPI):** per-controller service classes (e.g. `FlowService`, `AuthService`, `TenancyService`) with one method per endpoint, plus the request/response DTO types. These mirror the backend exactly — see the backend package docs ([`@stynx/flow`](/docs/packages/flow/), etc.) for what each endpoint does, and the [TypeDoc](/docs/api-reference/stynx-web-sdk/) for the symbol-level signatures.

**Hand-authored helpers:**

| Area      | Exports                                     | Description                                                                        |
| --------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Transport | `api-client`, `client`, `http`, `transport` | The configurable HTTP layer the generated code calls through.                      |
| Auth      | `auth`, `auth-provider`, `authorization`    | Auth-token plumbing + the provider interface `@stynx-web/angular-auth` implements. |
| Session   | `session-manager`, `token-store`            | Session lifecycle + token storage abstraction.                                     |
| Identity  | `cognito`, `jwt`                            | Cognito + JWT helpers.                                                             |
| Tenant    | `tenant-provider`                           | Tenant-context provider interface.                                                 |
| Errors    | `errors`                                    | Typed error classes mapping the STYNX error envelope.                              |

## Configuration

| Surface           | Description                                                                     |
| ----------------- | ------------------------------------------------------------------------------- |
| `OpenAPI.BASE`    | The backend base URL. Set by `provideStynxAngular()` or manually.               |
| `OpenAPI.TOKEN`   | The bearer token resolver. Wired by `@stynx-web/angular-auth`.                  |
| `OpenAPI.HEADERS` | Default headers (tenant, locale). Wired by `@stynx-web/angular`'s interceptors. |

## Examples

### Example 1 — calling an operation directly

```ts
import { TenancyService } from '@stynx-web/sdk';
const tenants = await TenancyService.listTenants();
```

### Example 2 — handling a STYNX error envelope

```ts
import { StynxApiError } from '@stynx-web/sdk';
try {
  await FlowService.createForm({ name: 'X' });
} catch (e) {
  if (e instanceof StynxApiError) {
    console.error(e.code, e.status); // structured envelope fields
  }
}
```

### Example 3 — regenerating the SDK after a backend contract change

```bash
pnpm sdk:codegen   # from the workspace root
```

This re-runs OpenAPI codegen against the backend's contract. Commit the regenerated `src/generated/`.

## Common pitfalls

- **Stale generated client** — the SDK is generated; if the backend contract changes and you don't regenerate, runtime calls hit endpoints that have moved or DTOs that changed shape. Re-run `pnpm sdk:codegen` after backend contract changes.
- **Setting `OpenAPI.BASE` after the first call** — the base URL is read per-request, but inconsistent setting leads to some calls hitting the wrong origin. Set it once at bootstrap (via `provideStynxAngular`).
- **Editing generated files by hand** — your edits are overwritten on the next codegen. Customize via the hand-authored helper layer, not the generated core.

## Related packages

- [`@stynx/flow`](/docs/packages/flow/) — the largest source of the SDK's generated operations (20 controllers).
- [`@stynx-web/angular`](/docs/packages-web/angular/) — wires the SDK into Angular DI.
- [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth/) — implements the auth provider the SDK consumes.

## TypeDoc reference

Full symbol-level API (the authoritative source for the generated surface): [`/docs/api-reference/stynx-web-sdk/`](/docs/api-reference/stynx-web-sdk/)
