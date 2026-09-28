# Cross-family delivery-review — CTG-0007 repair delta

You are Claude Code Opus 5.5, an independent read-only reviewer. Review this
STYNX worktree's CTG-0007 repair delta after the first delivery-review PASS.
Read `reviews/ctg7-delivery-review-1.json`, its bridge receipt,
`work/rounds/R-0002/ctg-0007-plan.md`, and the commits after `c1e09eda`
through current HEAD. DETRAN C-0002 is read-only. The earlier PASS covered the
five MUST capabilities; this review checks the reported fixes, regression
proof, and remaining gates.

Confirm: a replay-store error whose cause echoes the HMAC/key cannot expose
those bytes in its public message; an invalid `clock.now()` result throws and
the Nest guard responds 500; offset-form timezone `+03:00` is rejected while
UTC and named IANA zones work; skipped-midnight and repeated-hour vectors lock
exclusive due-date behavior. Inspect the new migrated real PostgreSQL/FORCE
RLS webhook test: signed technical actors for two tenants see only their own
rows, and a nonmember gets 403; verify that the protected query actually runs
under `stynx_app` and tenant context. Read the final `CI_EXIT=0` and
`REFERENCE_EXIT=0` markers in the named postreview logs and the plan's
explanation of the sequential release-policy rerun. Check trace and API
baselines, and whether the repair changed public declarations or generated
tooling.

The CTG-0005 HTTP 409 wire test remains deferred until the predecessor is
integrated. Distinguish this known later gate from a defect in this delta;
CTG-0007 will get a final post-predecessor review before PR merge. Do not
edit files, mutate Git, send external messages, or write in DETRAN. Return one
JSON object only, without Markdown:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}
