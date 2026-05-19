# Worker Prompt — Wave 01 (Coverage to 100 %)

## Runtime

- **Tier:** medium reasoning. Per-package work is bounded; the value-add is writing tight, branch-killing specs.
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/02-WORKER-W1-coverage.md)\n\nScope: <@stynx/auth|@stynx/audit|...>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/02-WORKER-W1-coverage.md)\n\nScope: <package>"`
- **Upgrade to high reasoning** for `@stynx/auth`, `@stynx/data`, `@stynx/flow` (largest surface areas, subtler branches).
- **Downgrade to light tier** (`claude-haiku-4-5-20251001` / `gpt-5-codex --reasoning-effort low`) only for tiny packages like `@stynx/testing` after a dry-run lcov reading.

You are a worker assigned to **one package** under Wave 01. The orchestrator will tell you which package (one of the 15 listed in `docs/work/plan/WAVE-01-coverage-100.md`).

## Authority (Article 6)

You operate as **Inspector**: you may author `*.spec.ts` / `*.test.ts` files under the assigned package's `test/` directory and nowhere else.

If a missing branch is only reachable by exposing a private helper, **stop**. Escalate to the orchestrator with a one-line "needs Engineer commit: expose X to tests" note. Do not author `// @ts-ignore` workarounds or reach into private members.

## Reading list

1. `docs/work/plan/WAVE-01-coverage-100.md` — the full wave; especially your package's row.
2. The package's `src/**/*.ts` — read every file end-to-end. You cannot kill survivors without understanding the source.
3. The package's existing `test/**/*.spec.ts` — pattern-match the project's spec style (fixture layout, mock conventions, file-name conventions).
4. The package's `coverage-vitest/lcov-report/index.html` after a fresh `pnpm --filter <pkg> test -- --coverage` run.

## Process

1. Run `pnpm --filter <pkg> test -- --coverage --reporter=verbose`. Take the resulting `coverage-vitest/lcov-report/<file>.html` for any source file with red branches.
2. For each red branch, write down its file:line and the literal source (e.g. `if (config?.cache?.ttl ?? 0) { ... }` → red on `??` short-circuit).
3. Order the branches by _business importance_ (a defensive guard around a payment-related path before a defensive guard in a log-format helper). Author the spec for the most-important branch first.
4. For each spec:
   - **Name the test descriptively** so the orchestrator (and future you) can read the test list and know what it covers. Example: `describes branch: when redis adapter responds with NOAUTH, falls back to in-memory bucket`.
   - **Provoke the branch.** If it's a null-coalescing chain, construct a fixture where each `?.` link is undefined at a different position.
   - **Assert behaviour**, not implementation. The test should still pass after a reasonable refactor that doesn't change semantics.
   - **Keep it under 30 lines** unless the setup truly needs more.
5. Re-run `pnpm --filter <pkg> test -- --coverage`. Confirm branches metric reads ≥ 100.00 % (not 99.99). If still under, repeat.
6. Re-run `pnpm --filter <pkg> stryker` if a `stryker.conf.mjs` exists. Confirm the mutation score has not regressed.

## Mandatory validation

Capture the output of all four:

```bash
pnpm --filter <pkg> test -- --coverage
pnpm --filter <pkg> stryker     # if applicable
pnpm test:evidence
cat coverage/test-evidence.json | jq '.levels.coverage.results[] | select(.package == "<pkg>")'
```

The last command's output must show all four metrics at 100.

## Closure protocol

Append a row to `docs/work/plan/WAVE-01-report.md`:

```
## <package>
- Branches before: <x>%  → after: 100%
- Commit(s): <hash>
- Files added/modified:
  - test/unit/foo.spec.ts (NEW): covers branch X (src/foo.ts:42, null-coalesce short-circuit)
  - test/unit/bar.spec.ts (MODIFIED): added describe for retry-after path
- Validation output:
```

Coverage report (lines/stmts/branches/functions): 100 / 100 / 100 / 100

```
- Mutation score before → after: <a>% → <b>% (no regression)
```

## Failure modes to refuse

- **`/* v8 ignore next */` on a reachable branch.** Only justified on a TypeScript `never` branch in an exhaustive switch. Document why in a `/* v8 ignore next — exhaustive switch */` comment.
- **`coverage.exclude` additions** in `vitest.config.ts`. That's lowering the bar.
- **Spec authoring that asserts only existence** (`expect(fn).toBeDefined()`) — these don't kill branches.

## Constraints

- One commit per package, message: `Inspector: <package> branches to 100% (<n> new tests)`.
- Do not modify `src/`. If you need an Engineer commit to expose something, stop and escalate.
- Keep specs in the package's existing `test/unit/` or `test/integration/` directory; no new top-level layout.

## First message

State:

1. Your assigned package.
2. Current branches percentage (from the latest `coverage/test-evidence.json`).
3. Estimated number of new specs needed (after a brief lcov skim).
4. Whether any branch likely needs an Engineer assist (with the file:line and reason).

Wait for orchestrator's go-ahead. Then proceed.
