# 09 — Frontend Patterns

&gt; **Scope.** This chapter tells a foreign frontend team how to consume a
&gt; STYNX-fronted API. Two integration shapes are supported:
&gt;
&gt; 1. **`@stynx-nyx/sdk` only** — framework-agnostic TypeScript HTTP
&gt; client. Drop into React, Vue, Svelte, vanilla TS, Node tools, etc.
&gt; 2. **Full Angular adoption** — `@stynx-nyx/angular*` packages compose
&gt; a turn-key Angular shell (interceptors, OIDC PKCE login, tenant
&gt; switcher, permission directive, document upload, trash UI, i18n).
&gt;
&gt; Citations point at HEAD (`670d165`) on `clean/doc-pass`. Anything
&gt; tagged `[GAP — sketched from package barrel]` is illustrative and
&gt; must be confirmed against the source listed in
&gt; `docs/stynx/porting-pack/05-PACKAGE-CATALOG.md` before shipping.

---

## Decision: Angular vs sdk-only

**If your existing frontend is non-Angular (React, Vue, vanilla TS, a
mobile RN app, a CLI, etc.) — use `@stynx-nyx/sdk` and keep your
existing UI.** The SDK is fetch-based and framework-neutral; it carries
the full STYNX request contract (auth header, tenant header, refresh
flow, error mapping) without dragging Angular into your bundle.

| You have                                           | Use                                                                                                      | Why                                                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| React / Next.js / Vue / Svelte / RN                | `@stynx-nyx/sdk`                                                                                         | Plug client into your existing data layer (TanStack Query, SWR, Pinia, etc.); no Angular peer deps. |
| Angular ≥ 17 standalone or NgModule shell          | `@stynx-nyx/angular` + `@stynx-nyx/angular-auth` + the per-feature packages you need                     | Interceptors, guards, and components are pre-wired.                                                 |
| Server-side TypeScript (Edge function, Lambda)     | `@stynx-nyx/sdk` with a polyfilled `fetch`                                                               | The SDK takes a `fetchFn` injection point — see `packages-web/sdk/src/transport.ts:6–12`.           |
| A non-TypeScript frontend (Flutter, Swift, Kotlin) | Generate your own client from the OpenAPI document; mimic the header + refresh contract documented below | The SDK is TS-only; no `[GAP — official non-JS clients are not shipped at HEAD]`.                   |

The matrix at the end of this chapter gives the per-component
decisions. The two long sections that follow walk through each
integration shape end-to-end.

---

## sdk-only adoption (non-Angular)

### Package surface

`packages-web/sdk/src/index.ts` re-exports 14 modules:

```ts
// packages-web/sdk/src/index.ts:1-14
export * from './api-client';
export * from './auth';
export * from './auth-provider';
export * from './authorization';
export * from './client';
export * from './cognito';
export * from './errors';
export * from './http';
export * from './jwt';
export * from './session-manager';
export * from './tenant-provider';
export * from './token-store';
export * from './transport';
export * from './generated'; // OpenAPI-generated typed client
```

The two pieces a consumer touches first are:

- **`StynxSdkClient`** (`packages-web/sdk/src/client.ts:4`) — a thin
  REST-verb wrapper over `StynxHttpTransport`.
- **`StynxHttpTransport`** (`packages-web/sdk/src/transport.ts:84`) —
  the actual transport. Owns header injection, the 401 → refresh
  retry, and error mapping.

### Importing the client

```ts
// minimal bootstrap, sketched from packages-web/sdk/src/client.ts:4–53
//   and packages-web/sdk/src/transport.ts:84–153
import { StynxSdkClient, type AuthProvider, type TenantProvider } from '@stynx-nyx/sdk';

const authProvider: AuthProvider = {
  async getAccessToken() {
    return localStorage.getItem('stynx.access_token');
  },
  async refresh() {
    // Call your IdP / refresh endpoint. Return the new access token,
    // or null to signal "give up — surface 401 to the caller".
    return null;
  },
  async onAuthFailure(error) {
    // Optional. Fired exactly once when refresh() returned null.
    window.location.assign('/login');
  },
};

const tenantProvider: TenantProvider = {
  async getTenantId() {
    return sessionStorage.getItem('stynx.tenant_id');
  },
};

const sdk = new StynxSdkClient({
  baseUrl: import.meta.env.VITE_STYNX_API_URL,
  fetchFn: fetch,
  authProvider,
  tenantProvider,
  defaultHeaders: {
    'Accept-Language': 'pt-BR,en-US;q=0.5',
  },
});

const records = await sdk.get<{ items: unknown[] }>('/api/records', {
  query: { page: 0, pageSize: 25 },
});
```

The `AuthProvider` and `TenantProvider` shapes come from
`packages-web/sdk/src/auth-provider.ts` and `tenant-provider.ts` —
read those for the exact methods.

### Headers the transport sets for you

`StynxHttpTransport` injects three request headers automatically when
a value is available (`packages-web/sdk/src/transport.ts:101–127`):

| Header                              | Source                                                          | Set when                                                          |
| ----------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| `Authorization: Bearer &lt;jwt&gt;` | `authProvider.getAccessToken()`                                 | provider yields a non-null token AND header isn't already present |
| `x-tenant-id: &lt;uuid&gt;`         | `tenantProvider.getTenantId()` (or per-call `request.tenantId`) | resolves to a non-null id AND header isn't already present        |
| `content-type: application/json`    | always for `body !== undefined`                                 | header isn't already present                                      |

`X-Request-Id` is **not** set by the SDK — the API will generate one
server-side if absent. If you want client-supplied request IDs (we
recommend it; it threads through audit logs), set them in
`defaultHeaders` or pass per-request `headers`. The Angular package
sets one automatically (`packages-web/angular/src/request-id.interceptor.ts:14`).

### Error shape

Server errors are normalized to `StynxSdkError` subclasses
(`packages-web/sdk/src/errors.ts:7–74`):

```ts
// packages-web/sdk/src/errors.ts:7-25
export class StynxSdkError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly context?: Record<string, unknown>,
    public readonly responseBody?: unknown,
  ) {
    /* ... */
  }
}

export class UnauthorizedError extends StynxSdkError {} // 401
export class ForbiddenError extends StynxSdkError {} // 403
export class NotFoundError extends StynxSdkError {} // 404
export class ConflictError extends StynxSdkError {} // 409
export class ValidationError extends StynxSdkError {} // 400, 422, *_VALIDATION_ERROR
export class RateLimitError extends StynxSdkError {} // 429
```

The on-the-wire shape of the JSON body is
`&#123; code?, message?, context? &#125;` — `createStynxSdkError`
(`packages-web/sdk/src/errors.ts:46–74`) defensively parses each field
and falls back to `"Request failed with status N"` if `message` is
missing. **`code` is the stable, branchable field — never branch on
`message`.** Consumers should treat unknown codes as opaque and
display the message.

### 401 → refresh flow

The SDK retries exactly once on 401 if an `authProvider` is configured
(`packages-web/sdk/src/transport.ts:133–141`):

```
1. Request fires, server returns 401.
2. transport calls authProvider.refresh().
3a. If it returns a string, transport retries the original request.
    The retry runs with allowRefresh=false, so a second 401 is final.
3b. If it returns null, transport calls authProvider.onAuthFailure?(err)
    and throws UnauthorizedError.
```

Two consequences for consumers:

1. **`refresh()` must be idempotent and concurrency-safe.** Multiple
   in-flight requests can each see a 401; build a single-flight
   wrapper or an in-memory promise gate.
2. **`onAuthFailure` is your "log out and redirect" hook.** It runs
   only when the refresh path declines — not on every 401. Don't
   double-redirect inside `refresh()`.

### Code example: minimal React hook

```tsx
// [GAP — sketched from package barrel; shape verified against
//  packages-web/sdk/src/client.ts:4–53 and errors.ts:7–25]
import { useEffect, useState } from 'react';
import { StynxSdkClient, StynxSdkError, UnauthorizedError } from '@stynx-nyx/sdk';

const sdk = new StynxSdkClient({
  baseUrl: process.env.NEXT_PUBLIC_STYNX_API_URL!,
  fetchFn: fetch,
  authProvider: {
    /* see above */
  },
  tenantProvider: {
    /* see above */
  },
});

export function useRecords() {
  const [data, setData] = useState<unknown[] | null>(null);
  const [error, setError] = useState<StynxSdkError | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    sdk
      .get<{ items: unknown[] }>('/api/records', { signal: ac.signal })
      .then((res) => setData(res.items))
      .catch((e: unknown) => {
        if (e instanceof UnauthorizedError) return; // onAuthFailure handles redirect
        if (e instanceof StynxSdkError) setError(e);
        // else: rethrow / log network errors as needed
      });
    return () => ac.abort();
  }, []);

  return { data, error };
}
```

For Vue/Svelte/etc. the shape is the same — instantiate one client at
module scope and pass it to your data-fetching primitive.

---

## Angular adoption

### Bootstrapping — `StynxAngularModule.forRoot`

The reference app composes the platform like this (full file at
`reference/web/src/app/reference-web.module.ts:1–82`):

```ts
// reference/web/src/app/reference-web.module.ts:21-52
@NgModule({
  imports: [
    BrowserModule,
    RouterModule.forRoot(APP_ROUTES),
    AppComponent,
    StynxAngularModule.forRoot({
      apiBaseUrl: environment.apiBaseUrl,
      sessionMode: 'bearer',
      defaultTenantResolver: async () => '01978f4a-32bf-7c27-a131-fd73a9e001a1',
    }),
    StynxAngularAuthModule.forRoot({
      oidc: {
        authority: environment.apiBaseUrl,
        clientId: 'reference-web-dev',
        redirectUrl: `${environment.appBaseUrl}/login`,
        postLogoutRedirectUri: `${environment.appBaseUrl}/login`,
        scope: 'openid profile email',
        responseType: 'code',
        silentRenew: false,
        useRefreshToken: false,
        ignoreNonceAfterRefresh: true,
        secureRoutes: [environment.apiBaseUrl],
      },
      loginRedirectRoute: '/login',
      unauthorizedRoute: '/unauthorized',
    }),
    StynxI18nModule.forRoot({
      defaultLocale: 'en-US',
      supportedLocales: ['en-US', 'pt-BR'],
      loadCatalog: async (locale: string) => ReferenceWebI18nService.catalog(locale),
    }),
  ],
  /* ... providers ... */
})
export class ReferenceWebModule {}
```

`StynxAngularModule.forRoot` (full source at
`packages-web/angular/src/stynx-angular.module.ts:18–64`) does the
following provider plumbing:

- Stores `options` on `STYNX_ANGULAR_OPTIONS`, your auth provider on
  `STYNX_AUTH_PROVIDER`, and a `Window` reference on `STYNX_WINDOW`.
- Optionally sets `CSP_NONCE` if `options.cspNonce` is provided.
- Calls `provideTenancy(&#123; defaultTenantResolver &#125;)` from
  `@stynx-nyx/angular-tenancy` (line 39).
- Provides `ErrorBannerService` and `ToastService`.
- Registers three multi-`HTTP_INTERCEPTORS` in this exact order:
  `RequestIdInterceptor` → `AuthInterceptor` → `ErrorInterceptor`.

The order matters: request-id is set first so it propagates even on
errors, auth runs next so refreshed tokens get stamped before the
error path fires, and the error interceptor is outermost so it sees
the final response status.

### HTTP interceptors

Three interceptors come for free with `StynxAngularModule.forRoot`.

**`RequestIdInterceptor`** (`packages-web/angular/src/request-id.interceptor.ts:7–21`):

```ts
// packages-web/angular/src/request-id.interceptor.ts:7-21
@Injectable()
export class RequestIdInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler) {
    if (request.headers.has('X-Request-Id')) {
      return next.handle(request);
    }
    return next.handle(
      request.clone({ setHeaders: { 'X-Request-Id': generateClientRequestId() } }),
    );
  }
}
```

Idempotent — won't overwrite an explicit caller-supplied request id.

**`AuthInterceptor`** (`packages-web/angular/src/auth.interceptor.ts:8–57`)
attaches the bearer token and replays once on 401:

```ts
// packages-web/angular/src/auth.interceptor.ts:23-50 (excerpt)
return from(Promise.resolve(authProvider.getAccessToken())).pipe(
  switchMap((token) => {
    const initialRequest =
      token && !request.headers.has('Authorization')
        ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
        : request;
    return next.handle(initialRequest).pipe(
      catchError((error: unknown) => {
        if (
          !(error instanceof HttpErrorResponse) ||
          error.status !== 401 ||
          initialRequest.headers.has('x-stynx-auth-retried')
        ) {
          return throwError(() => error);
        }
        return from(Promise.resolve(authProvider.refresh())).pipe(
          switchMap((refreshedToken) => {
            if (!refreshedToken) {
              /* onAuthFailure + throw */
            }
            const replay = request.clone({
              setHeaders: {
                Authorization: `Bearer ${refreshedToken}`,
                'x-stynx-auth-retried': 'true',
              },
            });
            return next.handle(replay);
          }),
        );
      }),
    );
  }),
);
```

The `x-stynx-auth-retried` sentinel header is what stops infinite
retry loops — keep your hands off it.

**`ErrorInterceptor`** (`packages-web/angular/src/error.interceptor.ts:7–28`)
turns Angular `HttpErrorResponse` into the same `StynxSdkError`
subclasses the SDK uses, then pushes a banner via `ErrorBannerService`:

```ts
// packages-web/angular/src/error.interceptor.ts:11-25
return next.handle(request).pipe(
  catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse) {
      const mapped = createStynxSdkError(error.status, error.error);
      this.errorBanner.show({ message: mapped.message /* code, status, context */ });
      return throwError(() => mapped);
    }
    return throwError(() => error);
  }),
);
```

So **inside Angular subscribers you catch `StynxSdkError`** (not raw
`HttpErrorResponse`), with the same subclasses listed in the SDK
section above.

`@stynx-nyx/angular-tenancy` ships its own `TenantInterceptor`
(`packages-web/angular-tenancy/src/tenant.interceptor.ts:7–24`) — call
`provideTenancy()` (which `StynxAngularModule.forRoot` already does)
to register it as a multi-provider:

```ts
// packages-web/angular-tenancy/src/tenant.interceptor.ts:7-24
@Injectable()
export class TenantInterceptor implements HttpInterceptor {
  constructor(@Inject(TenantContextService) private readonly tenantContext: TenantContextService) {}
  intercept(request: HttpRequest<unknown>, next: HttpHandler) {
    const tenantId = this.tenantContext.tenantId();
    if (!tenantId || request.headers.has('X-Tenant-Id')) {
      return next.handle(request);
    }
    return next.handle(
      request.clone({
        setHeaders: { 'X-Tenant-Id': tenantId },
      }),
    );
  }
}
```

### Cognito OIDC PKCE login

`StynxAngularAuthModule.forRoot(&#123;...&#125;)` accepts an `oidc` block that
maps to `angular-auth-oidc-client` config (see the reference-app
example above, lines 31–46). The salient fields:

| Field                         | Purpose                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `authority`                   | OIDC issuer. In dev/reference, points at the API itself. In prod, your Cognito user-pool hosted-UI domain.    |
| `clientId`                    | Cognito app-client id (public, PKCE).                                                                         |
| `redirectUrl`                 | Where Cognito sends the user after auth. Must be allow-listed in the user pool.                               |
| `responseType: 'code'` + PKCE | The PKCE flow is implicit in `responseType: 'code'` for browser apps; no client secret.                       |
| `secureRoutes`                | URL prefixes the OIDC client should attach the Cognito access token to. Usually one entry: your API base URL. |

The login page itself just calls `session.completeLogin(returnUrl)`
(`reference/web/src/app/core/reference-web-shell.service.ts:32–37`):

```ts
// reference/web/src/app/core/reference-web-shell.service.ts:32-37
async login(email: string, tenantId: string): Promise<void> {
  this.devOidc.beginLogin(email);
  this.tenantContext.setTenant(tenantId, 'manual');
  await this.session.completeLogin(`${window.location.origin}/login?tenantId=${tenantId}`);
  await this.router.navigate(['/']);
}
```

Real Cognito apps don't have the `devOidc.beginLogin(email)` step —
they redirect to the hosted UI and `completeLogin` resumes from the
OIDC callback. The reference uses a dev seam (`STYNX_OIDC_ADAPTER`
override) for deterministic e2e tests.

### Tenant switcher

`@stynx-nyx/angular-tenancy` exports six things
(`packages-web/angular-tenancy/src/index.ts:1–6`):

```ts
// packages-web/angular-tenancy/src/index.ts:1-6
export * from './provide-tenancy';
export * from './tenant-context.service';
export * from './tenant.interceptor';
export * from './tenant-switcher.component';
export * from './tokens';
export * from './types';
```

The drop-in component:

```ts
// packages-web/angular-tenancy/src/tenant-switcher.component.ts:6-33
@Component({
  selector: 'stynx-tenant-switcher',
  standalone: true,
  imports: [CommonModule],
  template: `
    <label>
      <span>Tenant</span>
      <select [value]="tenantContext.tenantId() ?? ''" (change)="selectTenant($event)">
        <option value="" disabled>Select tenant</option>
        <option *ngFor="let tenant of tenants" [value]="tenant.id">{{ tenant.label }}</option>
      </select>
    </label>
  `,
})
export class TenantSwitcherComponent {
  @Input({ required: true }) tenants: TenantOption[] = [];
  @Output() readonly tenantChange = new EventEmitter<string>();
  readonly tenantContext = inject(TenantContextService);
  selectTenant(event: Event): void {
    const tenantId = (event.target as HTMLSelectElement).value;
    if (!tenantId) return;
    this.tenantContext.setTenant(tenantId, 'manual');
    this.tenantChange.emit(tenantId);
  }
}
```

You feed it the `TenantOption[]` your shell already loaded; the
component writes back through `TenantContextService.setTenant(id,
'manual')`, which flips the `tenantId()` signal that
`TenantInterceptor` reads on every outbound request.

When tenants change, you usually also need to mint a new bearer token
scoped to the new tenant. The reference shell does this with
`session.switchTenant(tenantId)`
(`reference/web/src/app/core/reference-web-shell.service.ts:39–42`):

```ts
async switchTenant(tenantId: string): Promise<void> {
  await this.session.switchTenant(tenantId);
  await this.router.navigate(['/']);
}
```

`switchTenant` (in `StynxSessionService` from
`@stynx-nyx/angular-auth`) calls the API's tenant-switch endpoint, which
returns a fresh bearer for the new tenancy.

### Permission guards and `*stynxHasPermission`

Two layers:

**Route-level** (`packages-web/angular-auth/src/permission.guard.ts:7–19`):

```ts
// packages-web/angular-auth/src/permission.guard.ts:7-19
export function stynxPermissionGuard(...permissions: string[]): CanActivateFn {
  return () => {
    const session = inject(StynxSessionService);
    const router = inject(Router);
    const options = inject(STYNX_ANGULAR_AUTH_OPTIONS);

    if (session.hasAllPermissions(permissions)) {
      return true;
    }
    return router.parseUrl(options.unauthorizedRoute ?? '/unauthorized');
  };
}
```

Wire it into routes:

```ts
// [GAP — sketched from package barrel]
import { stynxPermissionGuard } from '@stynx-nyx/angular-auth';

export const APP_ROUTES: Routes = [
  {
    path: 'records',
    loadComponent: () => import('./pages/records.page'),
    canActivate: [stynxPermissionGuard('records:read:*')],
  },
  {
    path: 'admin/users',
    loadComponent: () => import('./pages/users.page'),
    canActivate: [stynxPermissionGuard('users:write:*', 'users:read:*')],
  },
];
```

**Element-level** —
`packages-web/angular-auth/src/has-permission.directive.ts:12–54`:

```ts
// packages-web/angular-auth/src/has-permission.directive.ts:12-37 (excerpt)
@Directive({ selector: '[stynxHasPermission]', standalone: true })
export class StynxHasPermissionDirective implements OnDestroy {
  // subscribes to session.active$ and renders/clears the embedded view
  // on every change.
  @Input() set stynxHasPermission(value: string | string[]) {
    /* ... */
  }
}
```

Use it like:

```html
<!-- [GAP — sketched from package barrel] -->
<button *stynxHasPermission="'records:write:*'" (click)="create()">New record</button>

<section *stynxHasPermission="['records:read:*', 'records:approve:*']">...</section>
```

Permissions are checked with `hasAllPermissions` semantics (AND across
the array). For OR semantics, gate from a component method or extend
the directive.

### Document upload component

`@stynx-nyx/angular-storage` exposes a turn-key uploader
(`packages-web/angular-storage/src/document-upload.component.ts:7–109`).
Wiring is two providers — the package's `DocumentService` and an
`XhrUploadExecutor` (the only ship-included executor; replace with
your own implementing `StynxUploadExecutor` if you need fetch-based or
chunked uploads):

```ts
// reference/web/src/app/reference-web.module.ts:53-72 (excerpt)
providers: [
  /* ... */
  DocumentService,
  XhrUploadExecutor,
  { provide: STYNX_UPLOAD_EXECUTOR, useExisting: XhrUploadExecutor },
],
```

In a page:

```html
<!-- [GAP — sketched from package barrel] -->
<stynx-document-upload
  collection="contracts"
  [allowedMimes]="['application/pdf']"
  [maxBytes]="10 * 1024 * 1024"
  (completed)="onUploadDone($event)"
>
</stynx-document-upload>
```

The component's `upload(file)` (full path
`packages-web/angular-storage/src/document-upload.component.ts:62–103`)
runs three calls under the hood:

1. `documents.initiate(...)` — POST to `/api/storage/documents` with
   filename/mime/size; receives a presigned URL.
2. `executor.upload(url, file, headers, onProgress)` — PUT directly
   to S3 (presigned).
3. `documents.complete(id)` — POST to mark the upload finalized;
   triggers the platform's malware scan (status comes back as
   `scanStatus` on the emitted `completed` event).

Failures bubble out as `StynxSdkError` and are surfaced via the
component's banner.

### Trash list component

`@stynx-nyx/angular-trash` exports a generic UI for soft-deleted rows
(`packages-web/angular-trash/src/trash-list.component.ts:7–178`). Bring
your own `StynxTrashAdapter` — the component is resource-agnostic:

```ts
// [GAP — sketched from packages-web/angular-trash/src/types.ts (barrel)
//   and adapter usage in trash-list.component.ts:111–161]
const recordsTrashAdapter: StynxTrashAdapter = {
  list: (resource, page) => sdk.get(`/api/${resource}/trash`, { query: page }),
  restore: (resource, id) => sdk.post(`/api/${resource}/${id}/restore`, {}),
  restoreWithCascade: (resource, id) =>
    sdk.post(`/api/${resource}/${id}/restore`, { cascade: true }),
  hardDelete: (resource, id) => sdk.delete(`/api/archive/${resource}/${id}`),
};
```

```html
<!-- [GAP — sketched from package barrel] -->
<stynx-trash-list
  resource="records"
  [adapter]="recordsTrashAdapter"
  hardDeletePermission="archive:hard-delete:records"
>
</stynx-trash-list>
```

The component handles the cascade-restore retry when the platform
returns a `RESTORE_REQUIRES_CASCADE`-class error
(`packages-web/angular-trash/src/trash-list.component.ts:132–146`),
and gates the "Hard delete" button on `hardDeletePermission` via
`StynxSessionService.hasAllPermissions`.

### i18n catalog overrides

`StynxI18nModule.forRoot` (`packages-web/angular-i18n/src/stynx-i18n.module.ts:17–`)
takes `defaultLocale`, `supportedLocales`, and a `loadCatalog`
callback. The reference-web wiring is:

```ts
// reference/web/src/app/reference-web.module.ts:47-51
StynxI18nModule.forRoot({
  defaultLocale: 'en-US',
  supportedLocales: ['en-US', 'pt-BR'],
  loadCatalog: async (locale: string) => ReferenceWebI18nService.catalog(locale),
}),
```

`loadCatalog` returns a flat `Record&lt;string, string&gt;` keyed by message
id. To **override** platform-shipped strings, merge platform catalog
with your own and let your keys win:

```ts
// [GAP — sketched from package barrel]
@Injectable()
export class AppI18nService {
  static async catalog(locale: 'en-US' | 'pt-BR'): Promise<Record<string, string>> {
    const [platform, app] = await Promise.all([
      import(`@stynx-nyx/angular-i18n/catalogs/${locale}.json`).then((m) => m.default),
      fetch(`/i18n/${locale}.json`).then((r) => r.json()),
    ]);
    return { ...platform, ...app }; // app keys win
  }
}
```

Use the pipe in templates:

```html
<!-- [GAP — sketched from package barrel] -->
<h1>{{ 'records.title' | translate }}</h1>
<stynx-locale-switcher></stynx-locale-switcher>
```

---

## Component decision matrix

| Need                                   | Reach for                                                   | Source                                                            |
| -------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Any frontend, just typed HTTP          | `StynxSdkClient`                                            | `packages-web/sdk/src/client.ts:4`                                |
| Override SDK fetch (SSR, Node)         | `StynxHttpTransport` direct                                 | `packages-web/sdk/src/transport.ts:84`                            |
| Angular shell bootstrap                | `StynxAngularModule.forRoot`                                | `packages-web/angular/src/stynx-angular.module.ts:18`             |
| Cognito OIDC PKCE login                | `StynxAngularAuthModule.forRoot(&#123;oidc&#125;)`          | `packages-web/angular-auth/src/index.ts:11`                       |
| In-app tenant switching                | `&lt;stynx-tenant-switcher&gt;` + `TenantContextService`    | `packages-web/angular-tenancy/src/tenant-switcher.component.ts:6` |
| Route-level permission gate            | `stynxPermissionGuard(...)`                                 | `packages-web/angular-auth/src/permission.guard.ts:7`             |
| Element-level permission gate          | `*stynxHasPermission`                                       | `packages-web/angular-auth/src/has-permission.directive.ts:12`    |
| File upload UI                         | `&lt;stynx-document-upload&gt;`                             | `packages-web/angular-storage/src/document-upload.component.ts:7` |
| Soft-delete restore UI                 | `&lt;stynx-trash-list&gt;`                                  | `packages-web/angular-trash/src/trash-list.component.ts:7`        |
| Session listing (revoke other devices) | `@stynx-nyx/angular-sessions`                               | `packages-web/angular-sessions/src/index.ts`                      |
| Profile page                           | `@stynx-nyx/angular-profile`                                | `packages-web/angular-profile/src/index.ts`                       |
| Locale switching + catalog             | `StynxI18nModule.forRoot` + `&lt;stynx-locale-switcher&gt;` | `packages-web/angular-i18n/src/stynx-i18n.module.ts:17`           |
| Banners / dialogs / table primitives   | `@stynx-nyx/angular-ui`                                     | `packages-web/angular-ui/src/index.ts`                            |
| Foreign FE without Angular             | `@stynx-nyx/sdk` only                                       | `packages-web/sdk/src/index.ts`                                   |

---

## Error handling shape

The unified contract — same in SDK and Angular consumers — is:

```
{ code, httpStatus, message, details? }
```

Mapped on the client to `StynxSdkError` subclasses
(`packages-web/sdk/src/errors.ts:46–74`):

| HTTP                             | Class               | When                                                                                 |
| -------------------------------- | ------------------- | ------------------------------------------------------------------------------------ |
| 401                              | `UnauthorizedError` | token missing / expired / failed refresh                                             |
| 403                              | `ForbiddenError`    | authenticated but lacking permission                                                 |
| 404                              | `NotFoundError`     | resource doesn't exist (or hidden by RLS)                                            |
| 409                              | `ConflictError`     | optimistic-lock collision, duplicate key, idempotency-key replay with different body |
| 400 / 422 / `*_VALIDATION_ERROR` | `ValidationError`   | input failed validation                                                              |
| 429                              | `RateLimitError`    | rate-limit window exceeded                                                           |
| other                            | `StynxSdkError`     | fall-through                                                                         |

### 401 — refresh-and-replay

Already covered above. **Display nothing on the first 401** — let the
auth path handle it. Only surface the error once `onAuthFailure`
fires (typically with a "your session ended, sign in again"
redirect).

```ts
// [GAP — sketched from package barrel]
try {
  await sdk.get('/api/records');
} catch (e) {
  if (e instanceof UnauthorizedError) {
    // Already handled by transport.onAuthFailure → login redirect.
    return;
  }
  throw e;
}
```

### 403 — show, don't redirect

403 means "you're known, but not allowed". Don't kick to login.
Render an in-place message and (optionally) a "request access" CTA:

```ts
// [GAP — sketched from package barrel]
catch (e) {
  if (e instanceof ForbiddenError) {
    this.errorBanner.show({
      message: e.message,                 // server-provided
      code: e.code ?? 'FORBIDDEN',
      status: 403,
    });
    return;
  }
  throw e;
}
```

In Angular, the `ErrorInterceptor` already pushes a banner — your
component code just decides whether to also disable affected UI.

### 409 — surface and offer a retry strategy

Common 409 causes:

- **Optimistic-lock collision** (`OPTIMISTIC_LOCK_VERSION_MISMATCH` or
  similar — confirm exact codes against `@stynx-nyx/contracts` errors
  module). Re-fetch the record, ask the user to merge, resubmit with
  the new `version`.
- **Idempotency-key replay with different body**
  (`IDEMPOTENCY_KEY_FINGERPRINT_MISMATCH`-class). Should never happen
  in well-behaved clients; if it does, generate a new key and retry.
- **Unique-constraint** (e.g. duplicate email). Translate the field
  via `error.context` into a form-level error.

```ts
// [GAP — sketched from package barrel]
catch (e) {
  if (e instanceof ConflictError) {
    if (e.code === 'OPTIMISTIC_LOCK_VERSION_MISMATCH') {
      const fresh = await sdk.get<Record>(`/api/records/${id}`);
      this.recordSignal.set(fresh);
      this.errorBanner.show({
        message: 'This record changed since you opened it. Review and resubmit.',
        code: e.code, status: 409,
      });
      return;
    }
    // Other 409s: render `e.message` + `e.context` field-level errors.
    this.applyFieldErrors(e.context);
    return;
  }
  throw e;
}
```

The `error.context` field is a free-form object; consumers should
treat keys defensively. Common shapes seen in the platform:

- `&#123; field: '&lt;path&gt;', constraint: '&lt;name&gt;' &#125;` for validation.
- `&#123; resource: '&lt;id&gt;', expectedVersion: N, actualVersion: M &#125;` for
  optimistic-lock.
- `&#123; retryAfterMs: N &#125;` for rate-limit (`RateLimitError`).

`[VERIFY against `packages/contracts/src/errors.ts` for the
canonical context shapes per error code — not enumerated in
discovery.]`

---

**Source citations recap.** All non-sketched code blocks above point
at one of these files at HEAD `670d165`:

- `packages-web/sdk/src/index.ts`
- `packages-web/sdk/src/client.ts`
- `packages-web/sdk/src/transport.ts`
- `packages-web/sdk/src/errors.ts`
- `packages-web/angular/src/index.ts`
- `packages-web/angular/src/stynx-angular.module.ts`
- `packages-web/angular/src/auth.interceptor.ts`
- `packages-web/angular/src/error.interceptor.ts`
- `packages-web/angular/src/request-id.interceptor.ts`
- `packages-web/angular-auth/src/index.ts`
- `packages-web/angular-auth/src/permission.guard.ts`
- `packages-web/angular-auth/src/has-permission.directive.ts`
- `packages-web/angular-tenancy/src/index.ts`
- `packages-web/angular-tenancy/src/tenant.interceptor.ts`
- `packages-web/angular-tenancy/src/tenant-switcher.component.ts`
- `packages-web/angular-storage/src/index.ts`
- `packages-web/angular-storage/src/document-upload.component.ts`
- `packages-web/angular-trash/src/index.ts`
- `packages-web/angular-trash/src/trash-list.component.ts`
- `packages-web/angular-i18n/src/index.ts`
- `packages-web/angular-i18n/src/stynx-i18n.module.ts`
- `reference/web/src/app/reference-web.module.ts`
- `reference/web/src/app/pages/login.page.ts`
- `reference/web/src/app/core/reference-web-shell.service.ts`

Anything fenced as `[GAP — sketched from package barrel]` is
illustrative wiring built from the public surface and must be
verified against the cited source before production use.
