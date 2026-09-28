# CTG-0008 integrated delivery review — repair cycle 2

You are independent Claude Code Opus 5.5, read-only. Read the previous
`reviews/ctg8-integrated-delivery-review-1.json`, prompt 94, the approved
contract and `ctg-0008-plan.md`, and the exact current delta since the first
review. Do not edit, mutate Git, dispatch workers, publish or write DETRAN.

Verify the two former blockers are closed. The packed consumer must run in
the root `pnpm test:int` Turbo lane without
`STYNX_TEST_PG_APP_PASSWORD`, with `@stynx-nyx/cli#test:int` explicitly
force-executed, and prove effective `stynx_app` for direct SQL and the
Database app pool under the existing CI admin credentials. The staged
rename-failure sensor must fail after staging has begun, leave `--out`
absent and remove its own `.stynx-generate-*` directory. Verify the
additional int32, route, index, symlink and inert metadata tests are
substantive and pass against Engineer-only source changes. Check that
packed output refusal, `--check` drift and manifest digests are now
asserted; DEVAI strict has zero findings with the exact cleanup receipt.

Assess UPS-CLI-01 as MUST under OD-S15-01. OD-S15-02 requires only an
ordered cumulative import now; full local CI, reference apps, one final PR,
remote CI and final publication follow the completed campaign scope.
Return only one JSON object with `verdict` (`PASS|REVIEW|FAIL`), `findings`
(`severity`, `file`, `issue`, `required_change`) and `summary`. No Markdown
fences.
