# packages-web

Reserved for the spec-defined `@stynx-web/*` package family.

- `sdk`: framework-agnostic TypeScript SDK with generated OpenAPI artifacts and hand-coded auth/tenant-aware transport.
- `angular`: Angular 20 core integration with interceptors, tenant context, error UX services, and shared bootstrap wiring.
- `angular-auth`: Angular 20 authentication/session integration over Cognito OIDC and STYNX session exchange.
- `angular-ui`: Angular 20 UI primitives such as banner, toast container, table, pagination, loading spinner, and confirm dialog.
- `angular-i18n`: runtime catalog loading and locale switching for Angular 20 apps.
- `angular-trash`: generic archive/trash list UI with restore and hard-delete flows.
- `angular-storage`: document upload service and upload component over STYNX presigned PUT flows.
- `angular-sessions`: active-session list UI integrated with the Angular auth session state.
- `angular-profile`: profile and preferences forms for reference and consumer apps.

## Standalone defaults

Standalone Angular consumers can bootstrap the core web providers through
`provideStynxDefaults()` from `@stynx-web/angular`:

```ts
bootstrapApplication(AppComponent, {
  providers: [
    provideStynxDefaults({
      angular: {
        apiBaseUrl: '/api',
        sessionMode: 'bearer',
      },
      auth: importProvidersFrom(StynxAngularAuthModule.forRoot(authOptions)),
      i18n: importProvidersFrom(StynxI18nModule.forRoot(i18nOptions)),
      flow: provideStynxFlow(flowClient),
    }),
  ],
});
```

The `angular` entry wires request-id, tenant, auth, and error interceptors plus
`ErrorBannerService` and `ToastService`. Optional feature entries accept the
provider bundle returned by the package that owns the feature, so consumers only
import `angular-auth`, `angular-i18n`, `angular-flow`, or UI packages when they
need them.
