# Cross-family prompt-review — CTG-0003 repair cycle 2

You are Claude Code Opus 5.5, independent read-only reviewer. Review
the current Architect contract
`docs/framework/contracts/authorization-session-1.5.md`, plan
`work/rounds/R-0002/ctg-0003-plan.md`, and worker prompts 40–43.
Compare with DETRAN C-0002 UPS-AUTHZ-01…07 and UPS-SES-01…03,
all MUST by OD-S15-01. The first valid review is
`work/rounds/R-0002/reviews/ctg3-prompt-review-1.json` (REVIEW).
It was obtained by direct `claude -p` because the DETRAN bridge's
first output was not valid JSON. Check every blocking issue from that
review against the repaired files: guard-time tenant and APP_GUARD
order; actual switch boundary and atomic prior-sid transition;
configurable verified factor parsing; active-session expiry in Redis;
bounded readiness and real health composition. Also check the three
nonblocking issues on wildcard semantics, denial envelopes and
locks/conformance. No worker has been dispatched.

Do not edit files, mutate Git, publish or write in DETRAN. Respond
with one JSON object only, with no preface or Markdown fences:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS permits Inspector dispatch. REVIEW or FAIL escalates under the
two-cycle limit. Keep the response concise and valid JSON.
