# Cross-family delivery-review — CTG-0002 SSE, repair cycle 2

You are Claude Code Opus 5.5, independent read-only reviewer. Review the
current `feat/release-1-5-0-sse` HEAD against CTG-0001 baseline
`e09bd6c00d56881fb5208a5e8fccfd6de3c0186a`. The scope is
UPS-SSE-01…10, UPS-NGSSE-01…10 and UPS-TEST-01 under the DETRAN C-0002
specification and `docs/framework/contracts/sse-1.5.md`. Do not write
to DETRAN. The first delivery review is
`work/rounds/R-0002/reviews/ctg2-delivery-review-1.json` (REVIEW).
Inspect every blocking finding and material nonblocking finding there
against the repaired tests and implementation. Verify that the real
PostgreSQL/RLS test proves recent cursor replay, hidden cursor reset,
tenant isolation, and missing tenant/actor preflight before SQL. Verify
that a package consumer resolves `@stynx-nyx/angular/testing` runtime
and declarations. Also inspect poison-row liveness, shutdown, bounded
Angular dedup and parser bytes, 204 delay, terminal auth, and READMEs.

The second full CI passed at
`/private/tmp/stynx-s15-ctg2-repair-final-ci-2.log` after the Architect
rebound the Angular public API baseline. Reference apps CI passed at
`/private/tmp/stynx-s15-ctg2-repair-reference-ci.log`; focused backend,
Angular, consumer and RLS integration tests passed. Trace is 398/398,
public API baseline 44/44. Check the current code and logs independently.

Do not edit files, mutate Git, publish, or write in DETRAN. Return only
JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS permits a PR after gates remain green; REVIEW requires repair and
another delivery-review; FAIL escalates. No Markdown fences.
