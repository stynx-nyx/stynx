# Architect — CTG-0002 trace and API baseline rebind

Role: Architect. Worktree:
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`.
The maestro alone runs Git. Start after Inspectors have recorded red
sensors. Use `pnpm check:trace --print` and update `law/trace.json`
for every reported drift or missing test, including changed existing
specs and the new reference/api spec, with no weakening of existing
traces. Re-run this rebind after any post-review test repair.
After Engineers stabilize the public API and the Angular build emits
both FESM bundles, run
`pnpm api:baselines:write` and inspect exact changes for backend root,
Angular root and `stynx-nyx-angular-testing.d.ts`; update only the
generated API baseline files that match the reviewed contract. Report
all changed files and deviations. The maestro commits law changes as
DEVAI Architect separately from tests and source. Do not edit tests,
source, workflows or DETRAN. Do not run Git, commit, push, publish or
open PR.
