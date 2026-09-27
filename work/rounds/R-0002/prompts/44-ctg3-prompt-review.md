# Cross-family prompt-review — CTG-0003 authorization and sessions

You are Claude Code Opus 5.5, independent read-only reviewer. Review
`work/rounds/R-0002/ctg-0003-plan.md`, the Architect contract
`docs/framework/contracts/authorization-session-1.5.md`, and worker
prompts `40-ctg3-inspector-authz.md` through
`43-ctg3-engineer-session.md`. Compare the full upstream DETRAN
C-0002 specification UPS-AUTHZ-01…07 and UPS-SES-01…03, including
OD-S15-01, with STYNX current code and development-contract. All ten
items are MUST for 1.5.0. Do not rely on proposed names where current
public symbols differ. Check especially default guard behavior,
presence and absence tests, trusted tenant and claims, full consumer
denial envelopes, atomic Redis session policy, verified factor on
create/switch, and health composition. Check locks and generated
tooling obligations. No worker may be dispatched until PASS.

Do not edit files, mutate Git, publish or write in DETRAN. Return only
JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

REVIEW permits one repair and a second review. FAIL escalates. No
Markdown fences.
