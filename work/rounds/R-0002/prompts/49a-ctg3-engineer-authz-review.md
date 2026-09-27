# Engineer A — CTG-0003 delivery-review repair

Role: Engineer. Read the Architect contract, the first delivery review,
and the red Inspector A tests before editing. Own only
`packages/contracts/src/**`, `packages/backend/src/**`, and
`packages-web/angular-auth/src/**` in the CTG-0003 worktree. Do not
edit tests, law, baselines, changesets, release files, Git, or DETRAN.

Export the shared `STYNX_VERIFIED_TENANT_ID` symbol from contracts.
`AuthContextGuard` must clear and set the marker only after a selected
tenant is verified by policy or membership. `AuthorizationGuard` must
read only this marker, never raw `request.tenantId`. Leave the tenant
lifecycle middleware's enrichment behavior intact. Export
`STYNX_AUTHZ_OPTIONS` from the dynamic authorization module so the
configured local guard works. Make the real `forRoot({global:true})`
Nest sensors and Angular nested wildcard parity pass. Preserve
all existing defaults and fail closed on unverified headers. Report
focused gates and any public API changes for Architect rebind.
