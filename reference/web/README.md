# Reference Web

`@stynx/reference-web` is the Angular 20 reference app for the neutral `sample.*` domain.

It exercises:

- `@stynx-web/angular` core integration and interceptors
- `@stynx-web/angular-auth` session + permission flows
- `@stynx-web/angular-ui` shared UI primitives
- `@stynx-web/angular-i18n` runtime locale switching
- `@stynx-web/angular-storage`, `angular-sessions`, `angular-profile`, and `angular-trash`

## Local Commands

```bash
pnpm --filter @stynx/reference-web build
pnpm --filter @stynx/reference-web build:web
pnpm --filter @stynx/reference-web serve
pnpm --filter @stynx/reference-web test:e2e
```

The app expects `reference-api` on `http://127.0.0.1:3000` by default.
