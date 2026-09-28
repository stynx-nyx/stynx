# CTG-0008 integrated delivery review — OD-S15-02

You are independent Claude Code Opus 5.5 in read-only delivery-review. Read
`prompts/93-ctg8-delivery-review.md` and apply all its substantive UPS-CLI-01
requirements to the exact HEAD and predecessor supplied by the maestro. Also
read `ctg-0008-plan.md`, `docs/framework/contracts/cli-generator-1.5.md`,
INV-CLI-001…004, the changed source/tests, and DETRAN C-0002 §6.10/§7
read-only. Do not mutate files, Git, packages, registry or DETRAN.

OD-S15-02 supersedes the old per-CTG PR, RC and full-CI language in prompt 93. Judge whether this HEAD is safe to import last into the cumulative CTG4–8
branch. The single full `pnpm ci:stynx`, reference apps, final PR, remote CI
and stable publication follow after final versioning. The focused external
consumer must actually run now and prove current-source packed tarballs,
SHA-512 lockfile integrity, compiled Nest routes and real PostgreSQL/FORCE RLS
for two tenants. Do not accept a root `test:int` cache replay as proof; the
focused `packages/cli` integration run is the current evidence. Verify the
CLI's `test:int` remains uncached so it will execute again in final CI.

Inspect the exact `FORBID-DROP-PROD` receipt for the rebased Inspector commit
`0018f245e6137464f3388d0862e369ba894e1c99`. It covers cleanup of the
uniquely named ephemeral test database only. DEVAI strict must show no
findings, and the Owner's 2026-09-27 blanket authorization for all remaining
C-0002 receipts is recorded. The first post-rebase consumer run failed because
the local `stynx_app` test role lacked a TCP password; the role was provisioned
and the unchanged sensor passed on its second run. Check this triage rather
than interpreting the first environment failure as a plant failure.

Return only one JSON object with `verdict` (`PASS|REVIEW|FAIL`), `findings`
(`severity`, `file`, `issue`, `required_change`) and `summary`. A missing MUST
proof is blocking. No Markdown fences.
