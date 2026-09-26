# Cross-family prompt-review — STYNX 1.5.0 CTG-0001

You are **Claude Code Opus 5.5**, the read-only reviewer from the other model
family. Review `work/rounds/R-0002/plan.md` and worker prompts 01, 02 and 03
in this directory **before any worker is dispatched**. Inspect current STYNX
source when needed. The DETRAN source specification is read-only at
`/Users/aarusso/Development/detran/work/campaigns/C-0002-stynx-upstream-spec.md`
§§3 and 8. Do not edit any file or run Git mutations.

This is cycle 2. Cycle 1 returned REVIEW in
`work/rounds/R-0002/reviews/ctg-0001-prompt-review-1.json`; verify that its
blocking findings were repaired. Report any remaining concrete blocker.

Check exact coverage of UPS-TEN-01…06 and their negative tests; option (b) for
TEN-01; Host/header rejection; public-route authentication and membership
separation; safe context propagation; Nest middleware/CLS feasibility;
role-by-path boundaries; backward compatibility; RLS proof; and whether the
prompts make a complete Architect → Inspector → Engineer triplet. Check that
the nine-CTG order honors the Owner's U1–U15 MUST decision. Flag concrete
conflicts with `docs/meta/development-contract.md` or the constitution. Do not
invent a new Owner decision for already decided OD-S15-01.

Return **only one valid JSON object** with this shape:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

Use PASS when dispatch is safe; REVIEW for specific repairable prompt/plan
issues; FAIL only for an irreconcilable contract/policy issue. Cite file paths
and source facts in findings. No Markdown fences.
