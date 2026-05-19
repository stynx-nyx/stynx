# Worker Prompt — Wave 04 (Playwright Fan-out for `reference-web`)

## Runtime

- **Tier:** medium-to-high. Playwright spec authoring is pattern-heavy but choosing the right `expect.poll` / selector / fixture composition matters.
- **Claude Code:** `claude --model claude-sonnet-4-6 --permission-mode acceptEdits -p "$(cat docs/work/prompts/06-WORKER-W4-real-e2e-web.md)\n\nScope: <category>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort medium --sandbox workspace-write -- "$(cat docs/work/prompts/06-WORKER-W4-real-e2e-web.md)\n\nScope: <category>"`
- **Upgrade to high reasoning** for the `flow` and `roles` categories (multi-page, multi-actor scenarios).
- **Browser deps required.** Run `pnpm --filter @stynx/reference-web exec playwright install chromium` once in the runtime before authoring; ensure the env can start a local web server on port 3100.

You are a worker assigned to **one user-facing category** under Wave 04. Categories: `auth`, `profile`, `tenant`, `roles`, `records`, `work-items`, `documents`, `flow`, `sessions`, `i18n`, `trash`, `audit`, `smoke`. The orchestrator will tell you which.

## Authority (Article 6)

You operate as **Inspector** (authoring `reference/web/test/e2e/<category>/*.spec.ts` and `reference/web/test/e2e/shared/*.ts` + `fixtures.ts`).

If a `data-testid` is missing in the SPA, **stop** and escalate to the orchestrator for an Engineer assist on `reference/web/src/`. Do not author CSS-selector-based fallbacks.

## Reading list

1. `docs/work/plan/WAVE-04-real-e2e.md` — the wave's frontend section.
2. `reference/web/playwright.config.mjs` — projects, web server, base URL.
3. Existing `reference/web/test/e2e/*.spec.ts` — the legacy 4-spec suite to pattern-match.
4. `reference/web/src/app/` — components, routes, services. Understand which pages your category covers.
5. `reference/web/src/app/core/reference-web-dev-auth.backend.ts` — the dev-auth shortcut used by the Playwright run.

## Process

1. **Author one spec file per scenario** in your category. Keep specs single-purpose; each scenario in its own `test(...)`.
2. **Use `fixtures.ts`** for tenant/user IDs (don't hard-code repeated strings).
3. **Use `data-testid` selectors exclusively.** Refuse to use `text=` or CSS selectors for interactive elements.
4. **Use `expect.poll`** for async UI state; never `page.waitForTimeout`.
5. **Tag specs that need the real API** with `@needs-api` in the test title; they run under the `spa+api` Playwright project. Others run under `spa-only`.
6. **Add an `@axe-core/playwright` accessibility probe** for the primary view in each scenario, with a documented baseline allow-list.
7. **Trace on retry** — confirm `trace: 'on-first-retry'` is set in the relevant project config.

## Mandatory validation

```bash
pnpm --filter @stynx/reference-web test:e2e
pnpm test:evidence
cat coverage/test-evidence.json | jq '.levels.e2e.results[] | select(.package == "@stynx/reference-web")'
```

Run your new specs ≥ 3 times in a fresh shell. Capture and attach traces of any retry.

## Closure protocol

Append to `docs/work/plan/WAVE-04-report.md` (under the **Frontend** section):

```
## <category>
- Specs added: <list>
- Pages exercised: <route paths>
- @needs-api specs: <list>
- a11y probes added: <list of pages>
- Flakiness check: <runs> consecutive, <pass-rate>
- Wall time (single run): <s>
- Commit(s): <hash>
- Notes: <e.g. "added data-testid=login-tenant on src/app/pages/login.page.ts:42 (Engineer assist requested and granted)">
```

## Failure modes to refuse

- **Text-content selectors for interactive elements.** Translation breaks them.
- **`waitForTimeout` for any reason.** Use `waitForResponse`, `waitForSelector`, `expect.poll`.
- **Skipping a11y because of "later".** Add the probe even if the allow-list is initially permissive.
- **Hard-coding the admin user email or tenant UUID inline.** Use `fixtures.ts`.

## First message

State:

1. Your assigned category.
2. The scenarios you'll author (1–10).
3. The data-testids you'll need (and which are already in the SPA vs. need an Engineer assist).

Wait for orchestrator's go-ahead. Then proceed.
