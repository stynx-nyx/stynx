# Cross-family prompt-review — STYNX RC publication lane

You are Claude Code Opus 5.5, independent read-only reviewer. Review
`work/rounds/R-0002/plan.md` §Contrato da rota de publicação RC1 and
the Inspector/Engineer prompts 15 and 16 before worker dispatch.
OD-S15-01 requires `1.5.0-rc.1` for the merged CTG-0001. Package
publication requires a separate Owner receipt for the exact action and
candidate SHA. The existing release workflow is forbidden to edit
without its own Owner receipt; it already reads candidate from the
policy and guards exact-main dispatch. The current policy binds 1.4.0,
while the publisher hard-codes `--tag latest`.

Inspect the actual policy, scripts, tests and workflow. Identify any
incorrect assumption about GitHub Packages dist-tags, Changesets pre
state, policy digest, monotonicity, receipt content, or the workflow's
ability to publish an RC without edits. Do not edit files, mutate Git,
publish, or write in DETRAN. Return only JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS permits the Architect policy rebind and subsequent Inspector
dispatch after the RC candidate exists. REVIEW requires contract repair;
FAIL means an irreconcilable authority issue. No Markdown fences.
