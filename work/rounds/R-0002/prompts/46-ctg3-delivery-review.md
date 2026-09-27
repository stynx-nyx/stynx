# Cross-family delivery-review — CTG-0003 authorization and session

You are Claude Code Opus 5.5, independent read-only reviewer. Review the
CTG-0003 implementation and tests in this worktree against DETRAN C-0002
rev.2 UPS-AUTHZ-01…07 and UPS-SES-01…03. OD-S15-01 makes all ten MUST.
Use the accepted Architect contract at
`docs/framework/contracts/authorization-session-1.5.md`, the plan at
`work/rounds/R-0002/ctg-0003-plan.md`, and the accepted prompt review at
`work/rounds/R-0002/reviews/ctg3-prompt-review-2.json`. Confirm actual
public symbols and behavior from source, not proposed names alone.

Inspect presence and absence cases for authorization targets, permissions,
global guard ordering, tenant source, configurable evaluator, wildcard
matching, and Angular parity. Inspect single-session policy across two
concurrent real Redis clients, atomic tenant switch, revoked token reuse,
verified factor provenance, and bounded readiness including the reference
health composition. Check that old defaults still work, tests remain strong,
the fixed-group changeset and package documentation are accurate, API
baselines and trace reflect the changes, and no generated tooling or DETRAN
source was hand-edited. Read the local CI and consumer logs named in the plan
when they are available. Distinguish blocking defects from suggestions.

The branch is still stacked on the CTG-0002 preparation head. Review this
CTG's implementation now; the maestro will integrate the merged CTG-0002
and obtain a post-integration review before the CTG-0003 PR is merged.

Do not edit files, mutate Git, or write in DETRAN. Return one JSON object
only, without Markdown:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}
