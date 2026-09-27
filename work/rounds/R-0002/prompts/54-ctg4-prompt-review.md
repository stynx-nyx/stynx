# Independent prompt review — CTG-0004 jobs

You are Claude Code Opus 5.5, independent read-only reviewer. Read the STYNX authority chain, accepted ADR-JOBS-0001 and superseding ADR-JOBS-0002, `docs/framework/contracts/jobs-api.md`, `jobs-actor-timezone-1.5.md`, migration note, CTG-0004 plan and prompts 50–53. Compare actual jobs/data code and DETRAN C-0002 §6.1/§7/§8 and OD-S15-01. All UPS-JOB-01…04 are MUST. Review the first direct report `work/rounds/R-0002/reviews/ctg4-prompt-review-1.json` and verify all seven blockers and three nonblockers are concretely resolved before Inspectors write.

Check app-role tenant CRUD and mismatch-before-SQL; active tenant membership and cross-actor permission; actorless SQL/worker dead-letter; exact owner/app boundary; positive handler write with technical actor on real FORCE RLS; correct migrated Postgres harness and DDL/seed obligations; file locks and B-to-A interface; DST edge cases; both polling ports and retry clock; fixed-group changeset, migration reservation, and upstream topological release. Identify exact remaining blockers, citing files and concrete repairs. No edits, Git/gh mutation, publication or DETRAN writes. Return only JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

REVIEW permits one repair and a second review; FAIL escalates. No Markdown fences.
