# Cross-family prompt review — CTG-0005, exceptional cycle 3

Owner decision 2026-09-27: explicitly authorized the exceptional third prompt-review for CTGs 4–8 in this R-0002 session. This supersedes earlier pending-exception checkpoints. Inspector and Engineer dispatch still require an Opus PASS and all predecessor gates.

This prompt is prepared for an Owner-authorized exception to the R-0002
two-cycle prompt-review limit. Do not run it until the Owner grants that
specific exception.

You are Claude Code Opus 5.5, independent read-only reviewer. Read the
first two verdicts at
`work/rounds/R-0002/reviews/ctg5-prompt-review-1.json` and
`work/rounds/R-0002/reviews/ctg5-prompt-review-2.json`. Review the
current `docs/framework/contracts/transactional-audit-idempotency-1.5.md`,
`ctg-0005-plan.md` and prompts 60–64 against DETRAN C-0002 §6.2,
OD-S15-01 and actual STYNX/Nest 11 source. All UPS-TXN-01…05 are MUST.

Confirm the cycle-2 blocking finding is closed: a default-201 Nest POST
emits and replays a deliberately committed 502 with exact stored wire
status/body through the method-scoped response filter, even with a
consumer global filter and outer mapper. Confirm an unselected marker
rolls back and follows the ordinary exception path. Check the other
cycle-2 findings: owner BYPASSRLS and wrapper validation, lock timeout
limited to reservation, body absence by HTTP framing, and predecessor
reconciliation before Inspector dispatch. Recheck all cycle-1 blockers,
including app-role audit write, key identity, one connection, `retry:false`,
RLS, error/rollback semantics and the real PostgreSQL sensor plan.

The CTG-0003/0004 predecessor gate is pending. A PASS approves this
contract and its prompts conditionally; it does not authorize Inspector
dispatch until the exact SHA/PASS/integration/reconciliation rows are
complete. Do not edit files, mutate Git, dispatch workers or write in
DETRAN. Return only one JSON object:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}
