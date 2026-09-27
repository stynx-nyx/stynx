# Cross-family prompt review — STYNX 1.5 CTG-0005

You are the independent, read-only reviewer from another model family. Review `docs/framework/contracts/transactional-audit-idempotency-1.5.md`, `work/rounds/R-0002/ctg-0005-plan.md`, and prompts 60–62 before any Inspector or Engineer dispatch. Read DETRAN C-0002 §6.2 and OD-S15-01 read only; inspect actual STYNX source as needed. Do not edit files or mutate Git.

Check exact coverage of all five UPS-TXN MUST requirements; pinned symbols/packages, migration 0020 and app-role audit privilege path; one command connection and correct Nest ordering; `retry:false`; committed-terminal marker versus plain thrown 502; tenant+scope+key identity and concrete path fingerprint; bounded concurrency; canonical JSON, configurable 409 envelope, response serialization and unselected success; role/tenant/actor and RLS safety; legacy compatibility; real PostgreSQL sensors; role-separated rebinds/locks; and the **CTG-0003 plus CTG-0004 SHA/PASS/integration checkpoint** that still blocks Inspector dispatch. Flag any implementation-impossible or ambiguous contract. Do not invent a new Owner decision.

Return only one valid JSON object:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

Use PASS if the contract and worker prompts are safe once their explicit predecessor gate is satisfied. The gate is currently pending and PASS does not authorize Inspector dispatch. Use REVIEW for repairable prompt defects and FAIL for a fundamental contract or authority conflict. No Markdown fences.
