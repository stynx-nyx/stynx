# Session signing key rotation runbook

**Authority:** Architect (Constitution Article 6).
**Scope:** STYNX session access-token signing keys used by `@stynx-nyx/sessions`.
**Applies to:** deployments that issue STYNX-side session JWTs and expose JWKS
through `@stynx-nyx/sessions`.

## Code references

- `packages/sessions/src/jwt-signing.service.ts` — `SessionJwtSigningService`
  signs access tokens with the active `kid`, exposes JWKS, and loads key
  material from either `jwt.keySet` or `jwt.secretId`.
- `packages/sessions/src/errors.ts` — `SessionSigningKeyError`, including the
  missing-active-key failure mode.
- `packages/sessions/src/jwks.controller.ts` — public JWKS endpoint.
- `packages/sessions/src/session.service.ts` — session issuance path that calls
  the signing service.
- `packages/sessions/src/types.ts` — `StynxSessionSigningKeySet` shape.
- `packages/sessions/README.md` — package-level rotation example and operational
  pitfalls.
- `packages/auth/src/stynx-jwt.validator.ts` — verifier-side JWKS cache behavior
  in `@stynx-nyx/auth`.
- `packages/core/src/secret-loader.ts` — AWS Secrets Manager-backed
  `SecretLoader` used when `jwt.secretId` supplies key material.
- `reference/api/src/app.module.ts` — reference API wiring for session signing
  key material.

## Rotation triggers

Rotate the session-signing key set when any of these is true:

- Private key exposure is suspected or confirmed.
- A scheduled cryptoperiod ends.
- A key is stored in a secret whose access policy was over-broad.
- A signing algorithm or key-size policy changes.
- An operator needs to remove a key held by a retired environment or team.

Emergency rotations use the same choreography but shorten the grace window only
after assessing active-token exposure.

## Choreography

1. Generate a new RSA-2048 signing key pair and assign a new `kid`.
2. Add the new key to the configured key set while leaving the current
   `currentKid` unchanged. In AWS-backed deployments, update the Secrets Manager
   secret consumed by `SecretLoader`.
3. Deploy the additive key set everywhere that signs or verifies STYNX session
   tokens.
4. Confirm JWKS includes both the old and new `kid`.
5. Flip `currentKid` to the new `kid` and deploy again. New access tokens are
   now signed by the new key; old access tokens remain verifiable.
6. Keep the old key in the key set for a grace window at least as long as the
   maximum access-token TTL, plus verifier JWKS cache time. The current
   `@stynx-nyx/auth` validator caches JWKS for 12 hours.
7. After the grace window, remove the old key from the key set and deploy.
8. Confirm JWKS contains only the active and intentionally retained retired
   keys.

Do not flip `currentKid` until every verifier can fetch a JWKS containing the new
key. If `currentKid` names a key that is not present in the key set,
`SessionJwtSigningService` raises `SessionSigningKeyError` and token issuance
fails.

## Verification

- Load the runtime key set and confirm `currentKid` matches exactly one key.
- Call the JWKS endpoint and confirm it exposes the expected `kid` values.
- Create a new session and decode the JWT header; `kid` must be the active key.
- Verify an access token minted before the active-key flip until the grace
  window expires.
- Run the deployment's auth/session smoke path, including a protected endpoint
  guarded by `@stynx-nyx/auth`.
- Check application logs for `SessionSigningKeyError` and JWKS fetch failures.

## Rollback

If token issuance fails immediately after flipping the active key:

1. Restore `currentKid` to the previous key while keeping both keys in the set.
2. Redeploy signers first, then verifiers if they received a bad key set.
3. Invalidate any deployment-local secret cache where the platform exposes that
   control. `SecretLoader` supports explicit invalidation by secret id.
4. Confirm new sessions are signed by the previous `kid` and protected endpoints
   accept both old and newly minted tokens.

If verification fails but signing succeeds, keep the new active key in place only
if all verifiers can be updated quickly. Otherwise roll back `currentKid` and
repeat the additive-key deployment before attempting the flip again.
