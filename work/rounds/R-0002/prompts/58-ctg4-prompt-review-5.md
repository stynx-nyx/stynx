# CTG-0004 jobs — fifth cross-family prompt-review

The Owner authorized all prompt reviews necessary to complete C-0002 on
2026-09-27. You are Claude Code Opus 5.5, independent read-only reviewer.
Read the STYNX authority chain in AGENTS.md order, DETRAN C-0002 §6.1/§7/§8
and OD-S15-01 read-only, ADR-JOBS-0002, the jobs 1.5 contract,
`work/rounds/R-0002/ctg-0004-plan.md`, prompts 50–53, and all four prior review
receipts, especially `reviews/ctg4-prompt-review-4.json`. Compare against
actual jobs/data code and legacy tests.

Recheck the fourth-cycle findings: app and reader URLs must work with both
socket and TCP connection strings; data's migration test proves only state
after 0019, while the jobs integration worker test proves dead-letter behavior;
JobsService unit tests use real RequestContext and RequestContextMutator over
one CLS service with pinned synchronous shape errors and rejected asynchronous
context/mismatch errors; worker claim and per-job status transitions use short
system scopes; and materialization calculates next run from persisted
next_run_at while PostgreSQL clock_timestamp selects due rows and timestamps
outcomes. Confirm earlier actor, RLS, DST and sensor-lock repairs remain sound.
Report only concrete residual gaps. Do not edit files, run Git mutations,
dispatch workers, publish packages, or write DETRAN.

Return exactly one JSON object without Markdown:
{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}
