# Cross-family delivery-review — CTG-0007 utilities

You are Claude Code Opus 5.5, an independent read-only reviewer. Review this
worktree's CTG-0007 implementation against DETRAN C-0002 rev.2
UPS-HOOK-01…02, UPS-CAL-01…02 and UPS-NGIDEM-01. OD-S15-01 makes all five
MUST. Read `docs/framework/contracts/utilities-1.5.md`,
`work/rounds/R-0002/ctg-0007-plan.md`, the third prompt-review PASS at
`work/rounds/R-0002/reviews/ctg7-prompt-review-3.json`, the source, tests,
changeset, migration note and package READMEs. Confirm actual exported
symbols and behavior, not proposed names alone. DETRAN is read-only.

Inspect raw-byte HMAC and Unix-seconds window boundaries, duplicate headers,
constant-time comparison, atomic multi-instance replay-store port and
expiry, configured signed fields, guard identity clearing, HTTP 401/503/500,
technical actor handoff through CTG-0001 tenancy and real PostgreSQL/RLS
tests. Inspect clock injection, consumer-owned holidays, local civil-day
arithmetic, DST and exclusive due-date semantics, typed invalid inputs and
calendar exhaustion. Inspect Angular provider opt-in and duplicate detection,
command-only methods, existing header precedence, retry stability, SSE/GET
skips, strict JSON body validation, Unicode code-point key order,
`toJSON(key)`, Web Crypto failure and the CTG-0005 wire reconciliation.
Check that neither legacy outbox ACK verification nor unmarked HTTP requests
change behavior. Check public API baselines, trace bindings, fixed-group
changeset, README generator, and absence of hand-edited generated tooling.

The CTG-0005 transactional-command implementation and its real HTTP 409
integration proof are not yet available in this stacked branch. The Architect
reconciled its accepted wire contract and PASS SHA in the CTG-0007 plan; the
Inspector marked the live 409 sensor deferred until that predecessor is
integrated. Evaluate this boundary explicitly and distinguish a present
defect from a later integration gate. CTG-0007 will receive a fresh
post-predecessor review before its PR merges. Read local CI and consumer logs
named in the plan when present; do not infer green from a command merely
started. Identify blocking defects with concrete evidence and separate
nonblocking improvements.

Do not edit files, mutate Git, send external messages, or write in DETRAN.
Return one JSON object only, without Markdown:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}
