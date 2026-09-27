# CTG-0008 CLI — sixth cross-family prompt-review

The Owner authorized all prompt reviews necessary to complete C-0002 on
2026-09-27. You are Claude Code Opus 5.5, independent read-only reviewer.
Read AGENTS.md authority order, DETRAN C-0002 §6.10/§7/§8 and OD-S15-01
read-only, `docs/framework/contracts/cli-generator-1.5.md`,
`work/rounds/R-0002/ctg-0008-plan.md`, prompts 90–93, and prior review receipts,
especially `reviews/ctg8-prompt-review-5.json`. Compare the ratified contract
and worker prompts with current manifests, pnpm 9, Turbo and CI task graph.

Recheck both fifth-cycle findings: the contract must agree with the plan about
the complete local STYNX closure, tarball overrides and `--prefer-offline`
installation with an unreachable scoped STYNX registry. Before install, the
runner must assert override keys equal the closure. Any install error naming
the loopback endpoint or a STYNX package is a sensor failure; unobserved
requires a separate failed third-party registry probe. Every non-PASS outcome
exits nonzero. Confirm that before STYNX code runs the consumer lockfile proves
all installed STYNX packages are the packed closure, each with `file:` and
matching SHA-512 integrity. Recheck prior RLS, RBAC, schema and Turbo cache
protections. Report only concrete residual gaps. Do not edit files, run Git
mutations, dispatch workers, publish, or write DETRAN.

Return exactly one JSON object without Markdown:
{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}
