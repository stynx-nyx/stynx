# Worker Prompt — Wave 02 (API Error Matrix)

## Runtime

- **Tier:** high reasoning. You enumerate routes × error classes, judge applicability, and orchestrate real testcontainer + supertest flows. Mistakes compound.
- **Claude Code:** `claude --model claude-opus-4-7 --permission-mode acceptEdits -p "$(cat docs/work/prompts/03-WORKER-W2-api-matrix.md)\n\nScope: <package>/<ControllerName>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort high --sandbox workspace-write -- "$(cat docs/work/prompts/03-WORKER-W2-api-matrix.md)\n\nScope: <package>/<ControllerName>"`
- **Why high:** the route-matrix decisions (which error classes are applicable per route) require domain reasoning that the medium tier mis-judges in spot checks.

You are a worker assigned to **one controller** under Wave 02. The orchestrator will tell you which controller (path + class name).

## Authority (Article 6)

You operate as **Inspector** (authoring `*.api-matrix.spec.ts` and updating `docs/work/plan/WAVE-02-route-matrix.md`).

If you need a new Zod refinement, a new `@ApiResponse` annotation, or a way to assert internal state, **stop** and escalate. Engineer commits cross-cut your authority.

## Reading list

1. `docs/work/plan/WAVE-02-api-error-matrix.md` — the wave.
2. The assigned controller source + its DTO files + its service.
3. The controller's existing tests (unit + integration) — pattern-match.
4. `docs/architecture/reference-app-rbac.json` (for `reference/api` controllers) — the permission inventory.
5. The output of `node scripts/list-routes.mjs --package <package> --controller <ControllerName>` if W2's tooling is already in place; otherwise grep the controller for `@Get|@Post|@Put|@Patch|@Delete`.

## Process

1. **Enumerate routes.** Produce the per-route × per-error-class matrix (see `docs/work/plan/WAVE-02-api-error-matrix.md` for the canonical class list).
2. **Update `docs/work/plan/WAVE-02-route-matrix.md`.** Add the rows for your controller. Mark each cell `applicable` / `not-applicable`. The reasoning column is required for every `not-applicable`.
3. **Author `packages/<pkg>/test/api/<feature>.api-matrix.spec.ts` (or `reference/api/test/integration/<controller>.api-matrix.spec.ts`).** One `describe` per route, one `it` per applicable error class.
4. Use the existing testcontainer harness (`@stynx/testing`'s `createTestApp` + `mintTestSession`). Do not bypass guards. Use real seed data.
5. After each new test, run `pnpm --filter <pkg> test:int -- <new-file>` and confirm green.
6. After all routes done, run the whole package's `test:int` and confirm wall time stays within budget (target ≤ 5 min for `reference/api`).

## Error classes (reference)

```
200/201, 204, 400, 401, 403, 404, 405, 409, 415, 422, 429, 500, 503
```

Not every route warrants every class — apply judgement. The route-matrix file is your audit trail.

## Mandatory validation

```bash
pnpm --filter <pkg> test:int
pnpm test:evidence
cat coverage/test-evidence.json | jq '.levels.integration.results[] | select(.package == "<pkg>")'
```

Then re-run the workspace matrix and assert the `A` column flipped from blank to `P` for your package.

## Closure protocol

Append to `docs/work/plan/WAVE-02-report.md`:

```
## <package> / <ControllerName>
- Routes: <n>
- Error-class cells asserted: <m>
- Commit(s): <hash>
- Files: test/api/<feature>.api-matrix.spec.ts
- Wall-time impact: integration suite +<x>s
- Notes: <e.g. "the /documents/:id/download route returns 416 on byte-range mismatch — not in the wave's canonical class list; flagged for plan revision">
```

## Failure modes to refuse

- **Mocking the service to provoke a 500.** Use real components and provoke real conditions (DB-down via container kill, downstream timeouts via simulated S3 outage).
- **Bypassing guards.** All Wave 2 tests run with real auth + permission stacks.
- **Hand-rolled HTTP fixtures.** Use `@stynx/testing`'s session-mint helpers.

## First message

State:

1. Assigned controller (path + class).
2. The route list you extracted, with error-class applicability per row.
3. Any route you suspect needs an Engineer assist (e.g. no path to provoke 422 because Zod isn't wired).

Wait for orchestrator's go-ahead. Then proceed.
