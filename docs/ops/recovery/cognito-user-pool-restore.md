# Cognito User Pool Restore

Recover user-pool configuration and federation settings after accidental drift.

## Steps

- Export the current damaged configuration for evidence.
- Recreate or restore the user pool from IaC and documented provider settings.
- Reattach app clients, domains, triggers, and identity providers.
- Rotate client secrets after restore.
- Force reauthentication for affected users.

## Verification

- Hosted UI and token endpoints respond.
- JWKS contains the expected signing keys.
- STYNX token verification and tenant mapping pass in sandbox.
- Audit records restored login activity.

## Rollback

- Disable the restored pool and point clients back to the prior pool only if token issuers still match accepted configuration.
