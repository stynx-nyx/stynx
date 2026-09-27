# Inspector — CTG-0003 session sensors

Role Inspector. Work only in the CTG-0003 worktree. Read authority
sources and `docs/framework/contracts/authorization-session-1.5.md`.
Implement tests for UPS-SES-01…03 before production changes. Cover
single-session `off`, `revoke-existing`, `reject-new` in one user+tenant,
cross-tenant isolation, refresh invalidation, same-tenant concurrent
creation across multiple clients in real Redis, idle-expired
non-conflict and mirror/invalidation effects. Cover configured claim
name (`amr`, `acr`, custom), string and array shapes, comma/whitespace
parsing, case folding, malformed or missing claims, empty config at
boot, spoofed `deviceMeta`, creation and tenant switch. HTTP
`/sessions/switch` sensors must cover same-tenant and cross-tenant
switch, both modes, conflict denial before any write, and a second
chained switch preserving the verified marker. Direct
`SessionService.exchange` follows the same ordering. Compose the real
`StynxHealthModule` with the sessions indicator in
`reference/api/test/integration/session-readiness.integration.spec.ts`;
use an isolated Redis fixture, disconnect/reconnect it and assert
down within timeout then up. Cover normal behavior with policies
disabled. Use sessions, auth, and the named reference API test path
only, no backend or angular-auth tests. Do not edit production,
law, baselines, changeset or generated files. Run focused tests,
report expected failures and sensor issues; never weaken existing
tests. Do not run Git, publish, push or open PR. DETRAN is read-only.
