# CTG9 Inspector prompt-review 3 — bridge fallback

On 2026-09-28 the DETRAN bridge invoked Claude Code Opus 5.5 with
`prompts/150-ctg9-inspector-delta-prompt-review.md` against the STYNX
worktree. It exited 4 because the reviewer prefaced its JSON verdict with
an English status sentence, while the bridge requires exactly one JSON
expression. The bridge rejected the format, not the review content.

The maestro reran `claude -p` with the same prompt, model and plan permission
mode, using a JSON schema. The extracted structured verdict is recorded in
`ctg9-inspector-prompt-review-3.json`. The reviewer performed no writes.
