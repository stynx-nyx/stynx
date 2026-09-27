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
switch, both modes, conflict denial before any write, prior and
policy-revoked sid permission-cache invalidation, a switch while
strongFactor is off, and a second chained switch preserving the
verified marker. A custom store without the optional atomic method
must fail at module boot when policy is enabled. Direct
`SessionService.exchange` follows the same ordering. Compose the real
`StynxHealthModule` with the sessions indicator in
`reference/api/test/integration/session-readiness.integration.spec.ts`;
use an isolated Redis container, pause it while the client reconnects
and assert down within timeoutMs, then unpause and assert up. Cover
normal behavior with policies
disabled. Use sessions, auth, and the named reference API test path
only, no backend or angular-auth tests. Do not edit production,
law, baselines, changeset or generated files. Run focused tests,
report expected failures and sensor issues; never weaken existing
tests. Do not run Git, publish, push or open PR. DETRAN is read-only.
