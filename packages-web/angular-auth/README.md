# @stynx-web/angular-auth

Angular 20 authentication integration for STYNX.

It combines:
- `angular-auth-oidc-client` for Cognito OIDC PKCE
- STYNX session exchange via `/sessions`
- in-memory STYNX access token storage
- tab-scoped refresh token storage in `sessionStorage` by default
- optional refresh-token cookie mode via `refreshTokenStorage: 'cookie'`
- auth guard, permission guard, and `*stynxHasPermission`

Verification:

```bash
pnpm --filter @stynx-web/angular-auth test
pnpm --filter @stynx-web/angular-auth typecheck
```
