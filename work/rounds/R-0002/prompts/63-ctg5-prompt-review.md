# Cross-family prompt review — STYNX 1.5 CTG-0005

You are the independent, read-only reviewer from another model family. Review `docs/framework/contracts/transactional-audit-idempotency-1.5.md`, `work/rounds/R-0002/ctg-0005-plan.md`, and prompts 60–62 before any Inspector or Engineer dispatch. Read DETRAN C-0002 §6.2 and OD-S15-01 read only; inspect actual STYNX source as needed. Do not edit files or mutate Git.

Check exact coverage of all five UPS-TXN MUST requirements; one actual command connection and correct Nest ordering; role/tenant/actor and RLS safety; rollback and cache visibility; canonical JSON, scoped key and configurable 409; selected status policy with 502; compatibility with existing routes; real PostgreSQL sensors; authority separation; disjoint locks; and the CTG-0004 predecessor checkpoint. Flag any implementation-impossible or ambiguous contract, especially a 502 replay after command rollback. Do not invent a new Owner decision.

Return only one valid JSON object:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

Use PASS only if Inspector dispatch is safe; REVIEW for repairable prompt defects; FAIL for a fundamental contract or authority conflict. No Markdown fences.
