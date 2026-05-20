# Worker Prompt — Wave 04 (Real Backend E2E)

## Runtime

- **Tier:** high reasoning. Each flow file orchestrates real auth, real DB, real audit-trail assertions, and cross-tenant checks; the most failure-prone bit is _not_ the code but the test-design choices.
- **Claude Code:** `claude --model claude-opus-4-7 --permission-mode acceptEdits -p "$(cat docs/work/prompts/05-WORKER-W4-real-e2e-backend.md)\n\nScope: <flow-file-name>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort high --sandbox workspace-write -- "$(cat docs/work/prompts/05-WORKER-W4-real-e2e-backend.md)\n\nScope: <flow-file-name>"`
- **Docker required.** Long-running session (~5–10 min per flow); ensure the runtime has a wall-time budget allowing testcontainer pulls.

You are a worker assigned to **one backend flow file** under Wave 04. The orchestrator will tell you which flow (e.g. `auth-and-permissions.e2e.ts`, `documents.e2e.ts`).

## Authority (Article 6)

You operate as **Inspector** (authoring `reference/api/test/e2e/flows/*.e2e.ts` and adding fixtures under `reference/api/test/e2e/fixtures/`).

If the flow you're writing requires a `data-testid` change in the SPA (it shouldn't — that's the web worker's job) or an Engineer-level change in `reference/api/src/`, **stop** and escalate.

## Reading list

1. `docs/work/plan/WAVE-04-real-e2e.md` — the wave; especially your flow's section.
2. `reference/api/test/integration/reference-api.runtime.spec.ts` — the legacy super-spec; your flow may inherit fixtures from it.
3. `reference/api/src/sample/*.controller.ts` (and the matching DTOs/services) — the routes under test.
4. `@stynx/testing` exports — `createTestApp`, `mintTestSession`, `auditExpect`, `expectRLSIsolated`, `expectArchiveMirrorInSync`, etc.
5. `docs/architecture/reference-app-rbac.json` — permission map.

## Process

1. **Author the flow file.** Use a single `describe`; one `beforeAll` to spin the container + Nest bootstrap + seed. Avoid `beforeEach`-reseeding unless cross-test pollution shows up.
2. **Real auth.** Mint sessions via `mintTestSession`; do **not** override guards.
3. **Real DB.** Use the `createPostgresTestDatabase` helper; apply `db/ddl/*.sql` + `db/seed/*.sql`.
4. **Cover at minimum:**
   - Happy path end-to-end (login → action → side effect → audit row asserted).
   - One major negative path (permission denied, validation error, idempotency conflict — whichever is canonical for the flow).
   - Cross-tenant assertion (RLS isolation) where the flow has tenant-scoped resources.
5. **Audit trail check.** After every mutating step, query `audit.events` for the expected row.

## Mandatory validation

```bash
pnpm --filter @stynx/reference-api test:int
pnpm test:evidence
cat coverage/test-evidence.json | jq '.levels.e2e // .levels.integration'
```

Run the new flow file ≥ 3 times in quick succession to flush out flakiness. Document any retry/jitter taken in the closure.

## Closure protocol

Append to `docs/work/plan/WAVE-04-report.md` (under the **Backend** section):

```
## flows/<name>.e2e.ts
- Routes touched: <list>
- Actors: admin@<tenant>, viewer@<tenant>, member@<tenant>
- Assertions:
  - Happy: <one-line>
  - Negative: <one-line>
  - RLS / cross-tenant: <one-line>
  - Audit: <one-line — assert rows for operations X/Y/Z>
- Wall time (single run): <s>
- Flakiness check: 3 consecutive runs, all passed
- Commit(s): <hash>
```

## Failure modes to refuse

- **Overriding any guard** with `.overrideGuard(...).useValue({ canActivate: () => true })`.
- **Mocking the service layer.** This is real E2E; the service must run.
- **Hand-rolled JWT generation.** Use `mintTestSession`.
- **`beforeAll` that pulls from a previous test's leftover state.** Each flow file is isolated.

## First message

State:

1. Your assigned flow.
2. The routes you'll touch.
3. The actors/seeds you'll need.
4. Estimated wall time.

Wait for orchestrator's go-ahead. Then proceed.
