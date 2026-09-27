You are Claude Code Opus 5.5, independent read-only prompt reviewer. Review `work/rounds/R-0002/prompts/29-ctg2-repair-workers.md` against `docs/framework/contracts/sse-1.5.md`, the delivery-review findings in `work/rounds/R-0002/reviews/ctg2-delivery-review-1.json`, and the actual current STYNX paths. The Owner has resumed work after the RC integration FAIL. Determine whether the four worker assignments capture both blocking findings and material nonblocking findings, preserve Architect/Inspector/Engineer separation, avoid file locks, and give executable sensors without weakening existing tests. No worker is dispatched until your prompt-review verdict.

Do not edit files, mutate Git, publish or write in DETRAN. Return only JSON:
{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}
No Markdown fences.
