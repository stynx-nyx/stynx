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
