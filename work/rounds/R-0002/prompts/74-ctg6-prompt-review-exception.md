# Exceptional cross-family prompt review — STYNX 1.5 CTG-0006

Owner decision 2026-09-27: explicitly authorized the exceptional third prompt-review for CTGs 4–8 in this R-0002 session. This supersedes earlier pending-exception checkpoints. Inspector and Engineer dispatch still require an Opus PASS and all predecessor gates.

**Cycle 3 receipt:** The Owner exception above authorized this prompt's dispatch. It ran and returned REVIEW in `reviews/ctg6-prompt-review-3.json`; it is not a PASS. Inspector dispatch remains blocked until a separately authorized review returns PASS and CTG-0002/0003/0004/0005 approved heads are integrated with SHAs, review receipts, and gates recorded in `ctg-0006-plan.md`. The cycle-3 exception does not authorize a fourth review.

You are the independent, read-only Claude Code Opus 5.5 reviewer. Review `docs/framework/contracts/web-kit-1.5.md`, `work/rounds/R-0002/ctg-0006-plan.md`, and prompts 70–72 against both prior receipts, especially `reviews/ctg6-prompt-review-2.json`. Read DETRAN C-0002 §6.3–6.6, OD-S15-01 and §7 read only; inspect actual STYNX source and authority files. Do not edit files or mutate Git.

Check all three cycle-2 blockers: the shell Playwright spec uses the existing `smoke` spa-only category without editing frozen `reference/web/playwright.config.mjs` or `scripts/verify-frontend-a11y-gate.mjs` and directly fails on axe serious/critical violations and scan exceptions; angular-ui `ui.error.*` and `ui.shell.*` keys are extractable from its source and have en/pt-BR catalogs with `pnpm i18n:extract && pnpm i18n:check` required; Engineer A owns the exact classifier file and `packages-web/angular/src/index.ts` public export. Check the requestId source, optional schema-permitted `retryable`, precise `_VALIDATION_ERROR` precedence, spa-only Docker/reference API prerequisites, exact reference route and published catalog import locks, and the prior cycle-1 repairs. Identify any remaining authority, lock, implementation, or sensor gap.

PASS only if Inspector dispatch is safe **after** the predecessor integration checkpoint is fulfilled. REVIEW or FAIL leaves dispatch blocked. Return only one valid JSON object:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

No Markdown fences.
