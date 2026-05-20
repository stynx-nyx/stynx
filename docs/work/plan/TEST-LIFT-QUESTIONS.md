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
