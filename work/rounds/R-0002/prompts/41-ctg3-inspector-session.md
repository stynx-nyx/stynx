# Inspector — CTG-0003 session sensors

Role Inspector. Work only in the CTG-0003 worktree. Read authority
sources and `docs/framework/contracts/authorization-session-1.5.md`.
Implement tests for UPS-SES-01…03 before production changes. Cover
single-session `off`, `revoke-existing`, `reject-new` in one user+tenant,
cross-tenant isolation, refresh invalidation, same-tenant concurrent
creation in real Redis, and mirror/invalidation effects. Cover
strong-factor accept/deny from validated `amr`/`acr`, malformed or
missing claims, spoofed `deviceMeta`, creation and tenant switch;
denial must happen before revocation. Cover readiness up/down and
normal behavior with policies disabled. Use sessions and auth test
paths only, no backend or angular-auth tests. Do not edit production,
law, baselines, changeset or generated files. Run focused tests,
report expected failures and sensor issues; never weaken existing
tests. Do not run Git, publish, push or open PR. DETRAN is read-only.
