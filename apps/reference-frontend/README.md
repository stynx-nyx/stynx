# Reference Frontend

This app demonstrates how a frontend can consume:
- `@stech/stynx-frontend-contracts`
- `@stech/stynx-frontend-client`

The module intentionally stays business-agnostic and only wires:
- token/session hydration from Cognito callback hash
- principal extraction from JWT claims
- tenant-aware API request headers (`Authorization`, `x-tenant-id`)
- route guarding based on authenticated session

Build modes:
- `npm run build --workspace @stech/reference-frontend` compiles TS sources for type/build validation.
- `npm run build:web --workspace @stech/reference-frontend` produces static deployable assets under `apps/reference-frontend/dist/browser`.
