# Prompt — Worker FE-G: Test Fan-Out (TestBed, Playwright, A11y, Mutation)

## Runtime

- **Tier:** default for most; heaviest for the Playwright real-OIDC plumbing (G.7).
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/FE-07-WORKER-G-test-fan-out.md)\n\nScope: <workstream-id or package>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/FE-07-WORKER-G-test-fan-out.md)\n\nScope: <workstream-id or package>"`

You are a worker for Wave **FE-G — Test Fan-Out** in the stynx frontend completeness programme.

## Scope

- G.1 — `test/support/test-bed.ts` (`renderComponent<T>(...)`) per package.
- G.2 — One exemplar TestBed component spec per package.
- G.3 — Author component / service / directive / pipe specs against every shipped component (per-package, can be sub-divided).
- G.4 — Router specs per package shipping `Routes`.
- G.5 — XHR / HTTP error matrix specs for `XhrUploadExecutor`, `MultipartUploadExecutor`, SDK transport.
- G.6 — Playwright fan-out: one spec per FE-01 vertical (file list in [`../diag/FE-05`](../diag/FE-05-testing-against-expectations.md)).
- G.7 — `PLAYWRIGHT_USE_REAL_OIDC=1` opt-in: boot `reference-api` + `oidc-fake-server` in `playwright.config.mjs`.
- G.8 — `@axe-core/playwright` integration; report under `.test-results/a11y.json`.
- G.9 — Stryker mutation rebase per package; achieve the thresholds in [`../diag/FE-05`](../diag/FE-05-testing-against-expectations.md#mutation-thresholds-proposed).
- G.10 — Delete per-package `*.e2e-spec.ts` smokes.

## Role (Article 6)

- G.1–G.6, G.8–G.10: **Inspector**. You may author under `packages-web/*/test/`, `reference/web/test/e2e/`, `.test-results/`.
- G.7: **Engineer** (config under `reference/web/playwright.config.mjs`) + **Inspector** (specs).
- Test-matrix policy change in `scripts/test-matrix.config.json`: **Architect** (separate routing).

## Wave success criteria (verbatim from `docs/work/plan/FE-WAVE-G-test-fan-out.md`)

1. Every shipped component has a TestBed-rendered spec.
2. Every package shipping routes has a router spec.
3. The Playwright fan-out covers every FE-01 row whose claim is now shipped.
4. `PLAYWRIGHT_USE_REAL_OIDC=1` boots `reference-api` and the suite passes.
5. `@axe-core/playwright` runs per spec; report under `.test-results/a11y.json`.
6. Mutation thresholds match the rebased table; Stryker records artifacts for all packages.
7. Per-package `*.e2e-spec.ts` smokes are deleted.
8. `coverage/test-evidence.json` reflects the new surface; the matrix view shows real depth, not just 100 % from stubs.

## Pre-flight

1. `./docs/work/plan/FE-WAVE-G-test-fan-out.md`.
2. `./docs/work/diag/FE-05-testing-against-expectations.md` — the test-layout proposal and the mutation threshold table.
3. `./docs/work/inv/FE-06-test-surface-vs-completeness.md` — verified / surface / unverified breakdown.
4. `./reference/web/playwright.config.mjs` — current config.
5. `./reference/web/test/e2e/` — existing scenarios; fixtures pattern.
6. The closure reports for FE-A through FE-F that ship the surface you are testing.

## Constraints

- One `expect(Component).toBeDefined()` test per package max — call it `consumer-smoke.spec.ts` and treat as a unit test. Everything else must exercise behaviour.
- Specs ≤ 60 s wall-time each (jsdom); Playwright specs ≤ 5 minutes each.
- Shared `reference/web/test/e2e/fixtures.ts` for canonical user / tenant identifiers.
- Axe scans non-blocking initially; a stabilisation window lets the orchestrator gate them later.
- Mutation: identify survivors, kill via new tests when possible, document otherwise.

## Validation commands

For unit-level work (G.1–G.5):

```bash
pnpm -r test
pnpm test:matrix --no-color --coverage
```

For Playwright (G.6–G.8):

```bash
cd reference/web && pnpm exec playwright install --with-deps
cd reference/web && pnpm exec playwright test --reporter=list
PLAYWRIGHT_USE_REAL_OIDC=1 (cd reference/web && pnpm exec playwright test --reporter=list)
```

For mutation (G.9):

```bash
pnpm -r --filter @stynx-web/<pkg> test:mutation
```

For G.10:

```bash
git rm packages-web/*/test/e2e/*.e2e-spec.ts
pnpm -r test    # must still pass
```

## Closure

Append to `docs/work/plan/FE-WAVE-G-report.md` per package or per workstream.

## Stop conditions

Stop and ask if:

- A package's TestBed setup conflicts with the global `provideStynx*` providers (DI cycle).
- The Playwright suite exceeds the wall-time budget even after parallelisation (consider partitioning into shards).
- Real-OIDC boot fails because `oidc-fake-server` isn't on the dev box (orchestrate the dependency).
- Mutation thresholds cannot be reached for one package without testing trivial branches (request a threshold adjustment).
