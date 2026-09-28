# Fourth CTG4 prompt-review fallback

The DETRAN bridge returned exit 4 because Claude wrapped its JSON response in a Markdown code fence. Under the campaign fallback rule, the same `57-ctg4-prompt-review-4.md` prompt was sent to `claude -p` with model `claude-opus-5-5` from this STYNX worktree. The raw output is at `/private/tmp/stynx-ctg4-prompt-review-4-fallback.raw` outside Git; `ctg4-prompt-review-4.json` is its parsed JSON object. Verdict: REVIEW.
