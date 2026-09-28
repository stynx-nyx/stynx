# Cross-family prompt-review cycle 2 — CTG-0004 jobs

You are Claude Code Opus 5.5, independent read-only reviewer. Recheck
the CTG-0004 Architect contract, ADR-JOBS-0002, amended ADR-JOBS-0001,
jobs-api.md, migration note, plan, and worker prompts 50–53 against
DETRAN C-0002 UPS-JOB-01…04, OD-S15-01, STYNX
`docs/meta/development-contract.md`, and the actual jobs/data code.
The first review is
`work/rounds/R-0002/reviews/ctg4-prompt-review-1.json`; verify that
each of its seven blocking and three nonblocking findings is resolved,
including the active-platform seed and new `test/db` platform spec
required by development-contract rule 3. All four jobs requirements
are MUST. No Inspector or Engineer has been dispatched for this CTG.

Do not edit files, mutate Git, publish, or write in DETRAN. Return only
JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

No Markdown fences. This is the last allowed prompt-review cycle;
FAIL or a remaining blocking REVIEW requires escalation.
