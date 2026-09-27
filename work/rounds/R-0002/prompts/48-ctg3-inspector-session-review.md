# Inspector B — CTG-0003 delivery-review repair

Role: Inspector. Work only in `/Users/aarusso/.codex/worktrees/ctg3-authz-session/stynx`.
Read the Architect authorization/session contract and `reviews/ctg3-delivery-review-1.json`.
Own only `packages/sessions/test/**`, `packages/auth/test/**`, and
`reference/api/test/integration/session-readiness.integration.spec.ts`.
Do not edit production, docs, law, or Git.

Extend real two-client Redis tests through `SessionService.exchange` in both
single-session modes: same-tenant prior exclusion; prior refresh token reuse
error after commit; reject-new target conflict leaves prior session active
and refreshable; controlled-clock idle expiry; other tenant survives;
concurrent exchange/create across clients. Add a sensor that a custom legacy
store lacking `createWithPolicy` fails at module boot even with mode `off`,
because exchange always needs the atomic transition. Restore or strengthen
the prior legacy-store test coverage. Add factor tests with blank accepted
values and whitespace-padded claims. Import `resolveSessionsOptions` through
the published sessions package in the reference readiness test. Keep all
existing assertions and use exact values/errors. Report failing tests and paths.
