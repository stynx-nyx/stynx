# Cross-family prompt-review — STYNX 1.5.0 RC versioning

You are Claude Code Opus 5.5, independent read-only reviewer. Review
`work/rounds/R-0002/plan.md` §Contrato de versionamento RC1 and the
Inspector and Engineer prompts `12-rc1-version-inspector.md` and
`13-rc1-version-engineer.md` before any worker dispatch. The Owner's
OD-S15-01 requires `1.5.0-rc.1` after CTG-0001. The worktree is at the
merged CTG-0001 plus DEVAI evidence; `.changeset/pre.json` is untracked
pre mode state from `pnpm changeset pre enter rc`. The first
`pnpm version-packages` incorrectly produced stable 1.5.0 after
Changesets generated 2.0.0-rc.0; the generated files were restored,
leaving pre mode active. No publication occurred.

Check the current versioner and fixtures to ensure the planned tests
separate stable, first RC, subsequent RC, no-op, and exit cases without
weakening the fixed-group rule. Identify any missing safety constraint or
incorrect assumption about Changesets pre.json. Do not edit files,
mutate Git, publish, or write in DETRAN. Return only JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS permits Inspector dispatch. REVIEW requires prompt/plan repair;
FAIL indicates an irreconcilable contract issue. No Markdown fences.
