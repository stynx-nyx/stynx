# Test Lift Questions

## 2026-05-20 - Phase 0 cleanup and evidence policy

The orchestrator opened Phase 0 from `docs/work/prompts/TEST-LIFT-00-ORCHESTRATOR.md` and found that worker spawning is blocked pending operator policy.

Current observations:

- `coverage/test-evidence.json` is missing, so coverage matrix output is provisional.
- The compact matrix currently has one non-green cell: `@stynx-domain/demo-bookmark-api` API `!`.
- The worktree is dirty across generated `.test-results/`, `pnpm-lock.yaml`, package/test/script/tool changes, and three docs files.
- A long-lived Playwright test-server is still running for `reference/web/playwright.config.mjs`.

Decision needed before evidence bootstrap or worker fan-out:

1. Should the orchestrator stop the existing Playwright test-server before continuing, or treat it as an operator-owned background service?
2. Should stale generated `.test-results/` artifacts be deleted and regenerated from scratch, or preserved and overwritten by the evidence bootstrap worker?
3. Should the current broad `pnpm-lock.yaml` drift be preserved as intentional worker output, or should an Engineer worker classify/narrow it before final gates?
4. Should `@stynx-domain/demo-bookmark-api` API `!` be repaired as applicable API coverage, or routed to an Architect policy decision for not-applicable status?

No worker was spawned after this finding.

## 2026-05-20 - Final gate preconditions after repair

The operator answered the Phase 0 cleanup questions and the orchestrator reran the test-lift flow against the live checkout.

Resolved decisions:

- The existing Playwright test-server was stopped before continuing.
- Fresh generated `.test-results` were preserved and overwritten by validation commands.
- `pnpm-lock.yaml` was preserved, then narrowed by an Engineer worker only where needed for frozen install consistency.
- `@stynx-domain/demo-bookmark-api` API `!` was repaired as applicable API coverage, not converted to not-applicable policy.

Current live evidence:

- `CI=1 pnpm install --offline --frozen-lockfile` passes.
- `pnpm i18n:check` passes.
- `pnpm test:evidence` regenerated `coverage/test-evidence.json` at `2026-05-20T15:45:32.803Z`.
- `pnpm test:matrix --no-color --compact` has no `!` cells.
- `pnpm test:matrix --no-color --coverage` is all green for displayed coverage rows.

Remaining questions before `TEST-LIFT-05-FINAL-GATES.md` can run:

1. Is PID `22001` (`claude`, cwd `/Users/aarusso/Development/stech/stynx`) operator-owned and safe to stop, or should the final gate wait until it exits?
2. Should the operator explicitly accept a narrower final-gate run while `FE-CLOSURE-REGISTRY.md` still marks FE-F and FE-G `IN_PROGRESS`, or should the orchestrator continue FE-F/FE-G closure first?
