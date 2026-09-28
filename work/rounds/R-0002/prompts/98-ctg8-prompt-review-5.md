# CTG-0008 CLI — fifth cross-family prompt-review

The Owner's 2026-09-27 authorization covers further prompt-reviews needed to
finish C-0002. You are Claude Code Opus 5.5, independent read-only reviewer.
Read AGENTS.md authority order, DETRAN C-0002 §6.10/§7/§8 and OD-S15-01
read-only, `docs/framework/contracts/cli-generator-1.5.md`,
`work/rounds/R-0002/ctg-0008-plan.md`, prompts 90–93, and all four prior
review receipts, especially `reviews/ctg8-prompt-review-4.json`. Compare
the repaired test contract against current package manifests, pnpm 9,
Turbo and CI task graph.

Recheck the fourth-cycle blocker: an external consumer with no lockfile on a
fresh CI store uses `pnpm install --prefer-offline` so third-party peers can
resolve, while its scoped `.npmrc` points `@stynx-nyx` to an unreachable
loopback endpoint. The runner computes the complete recursive STYNX closure
from manifest dependencies and peerDependencies, builds and packs current
source, applies tarball overrides, and proves every installed STYNX lockfile
entry is `file:` with the independently computed SHA-512 SRI before any STYNX
execution. Confirm that an attempted STYNX registry request or proof gap
fails rather than being classified as an environment skip. Confirm the
third-cycle turbo cache, generated RLS, RBAC and schema protections remain
sound. Report only concrete residual gaps. Do not edit files, run Git
mutations, dispatch workers, publish, or write DETRAN.

Return exactly one JSON object without Markdown:
{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}
