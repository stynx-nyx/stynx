# Database Role Rotation

Rotate `stynx_owner`, `stynx_app`, and `stynx_reader` credentials without breaking RLS.

## Steps

- Generate new passwords in the approved secret store.
- Alter each Postgres role password from an admin connection.
- Update application secrets for owner, app, and reader pools.
- Reload PgBouncer or connection poolers.
- Restart workloads gradually to drain old connections.

## Verification

- New connections authenticate with the rotated secrets.
- `stynx_owner` still has BYPASSRLS and app/reader do not.
- `pnpm db:verify` passes against the rotated database.
- Application health and readiness endpoints stay green.

## Rollback

- Restore the previous secret value only if it has not been compromised.
- If rollback is unsafe, rotate forward again and invalidate all old pool connections.
