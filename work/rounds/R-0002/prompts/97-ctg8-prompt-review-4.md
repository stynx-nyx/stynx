# CTG-0008 CLI — prepared fourth cross-family prompt-review

The first two ordinary reviews and the Owner-authorized third review returned REVIEW. This fourth prompt is prepared only; do not run it without a separate Owner decision. An Opus PASS is still required before Inspector dispatch.

You are Claude Code Opus 5.5, independent read-only reviewer. Read AGENTS.md authority order, DETRAN C-0002 §6.10/§7/§8 and OD-S15-01 read-only, docs/framework/contracts/cli-generator-1.5.md, work/rounds/R-0002/ctg-0008-plan.md, prompts 90–93, and all three prior review receipts, especially reviews/ctg8-prompt-review-3.json. Compare against current Turbo config, package graph, migration-created schemas, route scanner, CLI and local consumer packaging.

Recheck the third-cycle blocker: packages/cli/turbo.json is owned by Engineer 8C and disables cache for test:int, while the dedicated runner freshly builds all packed dependencies before pnpm pack. A database-unavailable or turbo-cached result is never PASS. Verify complete tarball overrides and the offline store rule, reserved schema derivation including database/migrations demo/sample and pre-existing schema failure, and a test-local structural RBAC assertion without editing scripts/**. Confirm original blueprint/permission/RLS requirements and role locks remain coherent. Report only concrete residual gaps. Do not edit files, run Git mutations, dispatch workers, publish packages, or write DETRAN.

Return one JSON object only: {"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}. PASS approves contract/prompts only; CTG7 and invariant checkpoints still apply.
