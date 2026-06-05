# Session Revocation

Manually invalidate a compromised session or refresh-token family.

## Steps

- Identify the session id and user id from `auth.sessions`.
- Mark the session or family revoked through `SessionService` or an owner transaction.
- Delete matching Redis session cache keys if Redis is enabled.
- Force the user to re-authenticate and rotate credentials when needed.

## Verification

- Access-token refresh fails for the revoked session.
- Redis no longer contains the revoked key family.
- `auth.sessions.revoked_at` is populated.
- Audit evidence records the manual revocation.

## Rollback

- Create a new session only after identity has been reverified.
- Do not clear the revocation audit event; append a corrective note if needed.
