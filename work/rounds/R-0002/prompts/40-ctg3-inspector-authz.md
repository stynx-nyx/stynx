# Inspector — CTG-0003 authorization sensors

Role Inspector. Work only in the CTG-0003 worktree. Read the repository
authority sources and `docs/framework/contracts/authorization-session-1.5.md`.
Implement tests for UPS-AUTHZ-01…07 before production changes. Cover
Nest `APP_GUARD` wiring with undecorated pass, decorated evaluation,
public bypass, method-over-class consumer resolver, missing principal,
tenant/claims delivery, custom/default evaluator token, deny factory,
and preservation of existing decorators. Register real
`AuthContextGuard` and `StynxAuthGuard` as earlier APP_GUARDs in
separate fixtures, then reverse order; never pre-seed request principal
or tenant. An unverified tenant header must leave evaluator tenantId
undefined. Assert exact HTTP status and JSON body under the real
exception filter for 401 missing-principal and 403 denied-target
factory results on decorated and resolver-only routes. Cover
`undefined`, `{}` and partial resolver targets, and unchanged
propagation when evaluator or factory throws. Exercise exact,
`resource:*`, nested prefix and `*` grants **and** denials in backend
and Angular session/directive/route guard, including case folding and
literal required-side wildcard; `ops:*` must not grant `inf:x`.
The separate auth PermissionGuard remains exact. Keep test files under
backend, contracts if needed, and angular-auth only. Do not edit sessions/auth,
law, baselines, changeset or generated files. Run focused tests to
show expected pre-implementation failures, then report paths, commands,
outcomes and any sensor errors. Never weaken existing tests. Do not
run Git, publish, push or open PR. DETRAN is read-only.
