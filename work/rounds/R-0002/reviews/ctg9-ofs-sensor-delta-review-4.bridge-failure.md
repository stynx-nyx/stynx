# CTG9 OFS sensor delta review 4 — bridge fallback

The DETRAN bridge invoked Claude Code Opus 5.5 with
`prompts/159-ctg9-ofs-sensor-delta-review.md` on 2026-09-28. It rejected
the reviewer's fenced JSON plus prose with exit 4. The text displayed a
PASS, but that was not an accepted bridge verdict.

The maestro reran `claude -p` with the same prompt, model and plan
permission mode using a JSON schema. Its structured verdict in
`ctg9-ofs-sensor-delta-review-4.json` is **REVIEW**: the PostgreSQL test
pool used the local superuser instead of `stynx_app`, making the role/RLS
oracle impossible. The structured verdict controls this checkpoint.
