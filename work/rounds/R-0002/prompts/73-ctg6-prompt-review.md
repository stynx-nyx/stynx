# Cross-family prompt review — STYNX 1.5 CTG-0006

You are the independent, read-only Claude Code Opus 5.5 reviewer. Review `docs/framework/contracts/web-kit-1.5.md`, `work/rounds/R-0002/ctg-0006-plan.md`, and prompts 70–72 before Inspector/Engineer dispatch. Read DETRAN C-0002 §6.3–6.6, OD-S15-01 and §7 read only; inspect actual STYNX source and authority files. Do not edit files or mutate Git.

This is cycle 2 after `reviews/ctg6-prompt-review-1.json` returned REVIEW. Check every blocking and pertinent nonblocking finding against the repaired contract/plan/prompts; specifically pre-Inspector predecessor integration table, CTG-0002 SSE raw bypass, core requestId priority/header equality, sdk law envelope code mapping, ErrorBannerState messageKey/fallback shape, complete status-kind and prefix table, actual secondary entrypoints and named test adoption, public-surface session stub with CTG-0003 wildcard matcher, and runnable spa-only axe gate. Check IFM scoped filter under StynxCoreModule, tag edge cases, error catalog registration, CTG-0005 ETag replay/commit boundary, Angular parity scope, Router dependency, theme/storage, fake Transaction role/Drizzle config, and i18n default locale. Flag implementation-impossible, under-specified or internally contradictory contracts and any weakening of existing behavior. PASS only if Inspector dispatch is safe **after** the integration gate is fulfilled.

Return only one valid JSON object:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

Use PASS only if Inspector dispatch is safe, REVIEW for repairable defects, FAIL for fundamental authority or contract conflict. No Markdown fences.
