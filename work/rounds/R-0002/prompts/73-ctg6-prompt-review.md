# Cross-family prompt review — STYNX 1.5 CTG-0006

You are the independent, read-only Claude Code Opus 5.5 reviewer. Review `docs/framework/contracts/web-kit-1.5.md`, `work/rounds/R-0002/ctg-0006-plan.md`, and prompts 70–72 before Inspector/Engineer dispatch. Read DETRAN C-0002 §6.3–6.6, OD-S15-01 and §7 read only; inspect actual STYNX source and authority files. Do not edit files or mutate Git.

Check complete MUST coverage of UPS-IFM-01…03, NGERR-01…04, SHELL-01…04 and TEST-02…04; feasibility of the Nest `@RequireIfMatch()` method decorator, `@IfMatchRevision()` parameter decorator and route filter; exact law error-envelope schema and current `StynxErrorFilter` divergence; revision parse and atomic mismatch boundary; Angular `provideStynxAngular`/module parity; prefix map and exclusion semantics; i18n/catalog conventions; actual `StynxSessionService.active$` type; typed fake `Transaction` feasibility; published testing subpaths; real axe/keyboard gate; role-separated files and topological CTG integration. Flag implementation-impossible, under-specified or internally contradictory contracts and any accidental weakening of existing behavior.

Return only one valid JSON object:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

Use PASS only if Inspector dispatch is safe, REVIEW for repairable defects, FAIL for fundamental authority or contract conflict. No Markdown fences.
