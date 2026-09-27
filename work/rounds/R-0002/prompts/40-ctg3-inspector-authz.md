# Inspector — CTG-0003 authorization sensors

Role Inspector. Work only in the CTG-0003 worktree. Read the repository
authority sources and `docs/framework/contracts/authorization-session-1.5.md`.
Implement tests for UPS-AUTHZ-01…07 before production changes. Cover
Nest `APP_GUARD` wiring with undecorated pass, decorated evaluation,
public bypass, method-over-class consumer resolver, missing principal,
tenant/claims delivery, custom/default evaluator token, deny factory,
and preservation of existing decorators. Exercise exact, `resource:*`
and `*` grants **and** denials in backend and Angular session/directive;
`ops:*` must not grant `inf:x`. Keep test files under backend,
contracts if needed, and angular-auth only. Do not edit sessions/auth,
law, baselines, changeset or generated files. Run focused tests to
show expected pre-implementation failures, then report paths, commands,
outcomes and any sensor errors. Never weaken existing tests. Do not
run Git, publish, push or open PR. DETRAN is read-only.
