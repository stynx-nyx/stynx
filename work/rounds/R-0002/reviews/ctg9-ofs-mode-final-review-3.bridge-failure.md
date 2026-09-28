# CTG9 OFS mode review 3 — bridge fallback

On 2026-09-28 the DETRAN bridge invoked Claude Code Opus 5.5 with
`prompts/157-ctg9-ofs-mode-final-review.md` against the STYNX worktree.
Its response was fenced JSON plus prose, so the bridge exited 4 instead
of accepting one JSON expression. The maestro reran `claude -p` with the
same prompt, model and plan permission mode using a JSON schema. The
structured REVIEW is in `ctg9-ofs-mode-final-review-3.json`.

The reviewer made no edits. Its three blocking findings are sensor
issues: impossible transport 422 due reused batch sequence, missing
PostgreSQL proof of CTG9/E6 `identity_mode` behavior, and missing actual
PostgreSQL item-transaction rollback proof. Inspector repair is pending.
