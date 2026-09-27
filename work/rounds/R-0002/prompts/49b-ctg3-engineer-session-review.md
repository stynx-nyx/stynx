# Engineer B — CTG-0003 delivery-review repair

Role: Engineer. Read the Architect contract, the first delivery review,
and the red Inspector B tests before editing. Own only
`packages/sessions/src/**` and `packages/auth/src/**` in the CTG-0003
worktree. Do not edit tests, docs, law, baselines, changesets, Git,
or DETRAN.

Set the `STYNX_VERIFIED_TENANT_ID` marker from verified private
`StynxAuthGuard` claims and clear it on public or failed paths.
The symbol is authored by Engineer A in contracts; coordinate its
availability without touching A's paths. Make session module boot
fail with a documented, exact error when a custom store lacks
`createWithPolicy`, including mode `off`. Keep Redis and in-memory
atomic transitions. Normalize strong-factor accepted values and
parsed claim tokens so blanks never match. Make the real two-client
Redis switch tests pass in both modes. Report focused gates and
public API changes for Architect rebind.
