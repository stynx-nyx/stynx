# CTG-0004 jobs — prepared fourth cross-family prompt-review

The first two ordinary reviews and the Owner-authorized third review returned REVIEW. This fourth prompt is prepared only; do not run it without a separate Owner decision. An Opus PASS is still required before Inspector dispatch.

You are Claude Code Opus 5.5, independent read-only reviewer. Read the STYNX authority chain in AGENTS.md order, DETRAN C-0002 §6.1/§7/§8 and OD-S15-01 read-only, ADR-JOBS-0002, docs/framework/contracts/jobs-actor-timezone-1.5.md, work/rounds/R-0002/ctg-0004-plan.md, prompts 50–53, and all three prior review receipts, especially reviews/ctg4-prompt-review-3.json. Compare against actual jobs/data code and legacy tests.

Recheck each third-cycle finding against the repaired contract and prompts: exact fixture/harness/assertion updates in four legacy specs with per-file report and equal-or-stronger assertions; published JobsService constructor/module wiring, membership method, missing-scope errors and validation order; real app/reader connection startup roles, current_user and non-bypass preconditions with no SET ROLE in the positive handler path; and pre-0019 migration staging with template disabled, owner transition, checksums and legacy rows. Confirm the cycle-1/2 repairs remain sound and that Inspector file locks cover all required edits. Report only concrete residual gaps. Do not edit files, run Git mutations, dispatch workers, publish packages, or write DETRAN.

Return one JSON object only: {"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}. PASS approves contract/prompts only; predecessor gates still apply.
