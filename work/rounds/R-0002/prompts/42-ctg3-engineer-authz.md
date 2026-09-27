# Engineer — CTG-0003 authorization implementation

Role Engineer. Start only after Inspector A sensors are committed by
the maestro. Follow the reviewed public contract in
`docs/framework/contracts/authorization-session-1.5.md`. Implement
UPS-AUTHZ-01…07 in backend, contracts and angular-auth. Preserve
default local-guard behavior; global opt-in uses the same guard
instance and documents authentication APP_GUARD ordering. Tenant
comes from an earlier verified auth guard, never a raw header.
The evaluator token must resolve with both default and custom policy.
Wildcard matching is segment aware, granted-side only and case
insensitive across backend and Angular. Keep the separate auth
PermissionGuard exact. Fix stale authorization docs and package examples
in owned paths. Run focused tests and relevant lint/typecheck. Do not
edit sessions/auth, Inspector tests unless reporting a sensor error,
law, baselines, changeset or generated files. No shim, copied DETRAN
code, Git, publication, push or PR. Report exact results.
