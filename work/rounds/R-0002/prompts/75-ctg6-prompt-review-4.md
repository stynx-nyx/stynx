# CTG-0006 web-kit — prepared fourth cross-family prompt-review

The first two ordinary reviews and the Owner-authorized third review returned REVIEW. This fourth prompt is prepared only; do not run it without a separate Owner decision. An Opus PASS is still required before Inspector dispatch.

You are Claude Code Opus 5.5, independent read-only reviewer. Read AGENTS.md authority order, DETRAN C-0002 §6.3–6.6/§7/§8 and OD-S15-01 read-only, docs/framework/contracts/web-kit-1.5.md, work/rounds/R-0002/ctg-0006-plan.md, prompts 70–72, and all three prior review receipts, especially reviews/ctg6-prompt-review-3.json. Compare against the actual reference/web build, TypeScript config, Angular UI exports/catalogs, Playwright and a11y gate.

Recheck the third-cycle blocker: the root Engineer lock owns reference/web/scripts/build-web.mjs and requires the additive @stynx-nyx/angular-ui/catalogs alias alongside the existing package alias. Distinguish the Playwright source bundle from the published-import TypeScript proof after angular-ui is built. Verify en-US/en and pt-BR catalog mapping and merger with existing catalogs. Confirm frozen Playwright and a11y files remain outside locks, axe fails serious/critical and scanner errors, i18n extraction works, and earlier findings remain repaired. Report only concrete residual gaps. Do not edit files, run Git mutations, dispatch workers, publish packages, or write DETRAN.

Return one JSON object only: {"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}. PASS approves contract/prompts only; predecessor integration still applies.
