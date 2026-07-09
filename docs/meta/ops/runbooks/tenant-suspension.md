# Tenant Suspension

Suspend or restore tenant access across API, database, and Cognito while preserving audit evidence.

## Steps

- Confirm the tenant slug and UUID from `tenancy.tenants`.
- Set `tenancy.tenants.is_active = false` with an owner-role transaction.
- Disable or remove Cognito group assignments for tenant-scoped access.
- Invalidate active sessions for affected users through `@stynx-nyx/sessions`.
- Record the operator, reason, ticket, and timestamp in the audit trail.

## Verification

- API calls for the tenant return authorization failures.
- Existing sessions cannot refresh into the suspended tenant.
- `tenancy.tenants.is_active` reflects the expected state.
- Audit entries include the suspension or restore reason.

## Rollback

- Restore Cognito assignments, set `is_active = true`, and ask users to re-authenticate.
- If the wrong tenant was suspended, preserve the erroneous audit event and append a corrective event.
