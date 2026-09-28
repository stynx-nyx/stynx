# CTG9 OFS mode delta review 2 — bridge fallback

On 2026-09-28 the DETRAN bridge invoked Claude Code Opus 5.5 with
`prompts/156-ctg9-ofs-mode-delta-review.md` against the STYNX worktree.
The reviewer returned a fenced JSON block followed by prose, so the bridge
exited 4 instead of accepting a single JSON expression. The reviewer
reported one read-only `git show --stat` despite the prompt's no-Git rule;
it made no edits.

The maestro reran `claude -p` with the same prompt, model and plan
permission mode using a JSON schema. Its structured REVIEW is saved in
`ctg9-ofs-mode-delta-review-2.json`. The review read a moving test tree while
the Inspector was applying the first fixes, so the final PASS must come
from a new review after the sensor and contract repairs are frozen.
