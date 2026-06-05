# KMS Key Recovery

Recover from disabled, rotated, or misconfigured KMS keys used by STYNX storage.

## Steps

- Identify affected key ids and aliases.
- Confirm key state, grants, and pending deletion windows.
- Restore grants for application roles or cancel deletion when approved.
- Re-encrypt affected object metadata if a replacement key is required.

## Verification

- New uploads and downloads succeed.
- CloudTrail shows expected KMS decrypt and encrypt calls.
- Storage audit entries reference the active key alias.

## Rollback

- Revert alias movement only if no new objects were encrypted with the replacement key.
- Otherwise keep the new key and schedule a re-encryption follow-up.
