# Cross-family delivery-review — STYNX 1.5.0-rc.2 versioning

You are Claude Code Opus 5.5, independent read-only reviewer. Review
`codex/release-1-5-0-rc2` against merged main CTG2
`ce6521438584db70f67e62f48d95048acd88be8b`. The worktree is
`/Users/aarusso/.codex/worktrees/ctg2-sse/stynx`. Review the native
Changesets pre-mode ordinal transition, the 44 fixed-group package
manifests and changelogs, `.changeset/pre.json`, root manifest,
package READMEs, SBOM, and Inspector rebind of tests whose historical
RC1/root-manifest expectations are superseded by the generated RC2.
Verify that negative release-version and frozen-contract assertions
remain meaningful. Do not treat an unmerged candidate as published.

Read exact local gates under `/private/tmp/stynx-s15-rc2-*` and report
only completed successful gates as passes. Check `pnpm ci:stynx`,
`pnpm ci:reference-apps`, release policy, provenance, consumer fixtures,
DEVAI strict policy, and any missing release evidence. In particular,
identify whether any candidate version references remain at rc.1 or
any package is outside the 44-package fixed group. The Owner has
authorized production of action-specific publication receipts, but
publication happens only after this branch is merged and an exact
main-SHA receipt is recorded and verified.

Do not edit files, mutate Git, publish, or write in DETRAN. Return only
JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS allows the versioning PR when gates are green; REVIEW requires a
repair and another review; FAIL escalates. No Markdown fences.
