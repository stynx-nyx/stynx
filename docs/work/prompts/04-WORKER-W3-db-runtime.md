# Worker Prompt — Wave 03 (DB Runtime Tests)

## Runtime

- **Tier:** high reasoning. PL/pgSQL, RLS semantics, deterministic hash chaining, and meta-query design are subtle; medium-tier output is correct in shape but frequently miscalibrated on SQLSTATE / role / search-path interactions.
- **Claude Code:** `claude --model claude-opus-4-7 --permission-mode acceptEdits -p "$(cat docs/work/prompts/04-WORKER-W3-db-runtime.md)\n\nScope: <schema|object|invariant>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort high --sandbox workspace-write -- "$(cat docs/work/prompts/04-WORKER-W3-db-runtime.md)\n\nScope: <schema|object|invariant>"`
- **Docker required:** the worker session must have Docker running locally (`docker info` exits 0) for testcontainers. Verify before starting.

You are a worker assigned to **one DDL scope** under Wave 03. The orchestrator will tell you the scope: a schema (e.g. `auth`), an individual function/trigger/policy, or one of the cross-schema invariants.

## Authority (Article 6)

You operate as **Inspector** (authoring `test/db/runtime/**/*.spec.ts` and `test/db/invariants/*.spec.ts`).

If you find the DDL needs a new helper for testability (e.g. `audit.get_chain_head_hash()`), **stop** and escalate to the orchestrator with an Engineer assist request.

## Reading list

1. `docs/work/plan/WAVE-03-db-runtime.md` — the wave.
2. `db/ddl/<schema>.sql` — read it end-to-end. Understand what every CREATE statement does.
3. `db/seed/00-base.sql` — the canonical seed.
4. `packages/data/test/support/postgres.ts` — the container helper.
5. Existing `test/db/*.ddl.spec.ts` — note what was already (text-)asserted.
6. `packages/audit/test/integration/`, `packages/auth/test/integration/`, `packages/data/test/integration/` — for fixture patterns.

## Process

1. **Spin a container** using the existing helper (`createPostgresTestDatabase()` from `@stynx/testing` or `packages/data/test/support/postgres.ts`). Apply `db/ddl/*.sql` + `db/seed/*.sql`.
2. **For each DDL object in scope** (function / trigger / policy):
   - Write a happy-path test (call function or trigger via INSERT/UPDATE/DELETE; assert side-effect).
   - Write a negative-path test (provoke `raise exception`; assert the SQLSTATE and message regex).
   - Write at least one **RLS** demonstration when relevant (run as two different `auth.set_tenant_context()` values; assert isolation).
3. **For triggers**, additionally assert the trigger fires on the right verbs and not on the wrong ones (`UPDATE` doesn't fire an `INSERT`-only trigger).
4. **For `audit.events_set_row_hash`**, commit a deterministic anchor: 5 hand-curated events whose chain SHA-256 outputs are pinned in the spec.
5. **For cross-schema invariants** (when assigned), author `test/db/invariants/<invariant>.spec.ts`:
   - SQL meta-queries against `pg_trigger` / `pg_policy` / `pg_extension` / `information_schema.*`.
   - Compare to a declared list in `docs/architecture/invariants/` (or hard-coded with a TODO if no such file exists).

## Test file layout

```
test/db/runtime/<schema>/<object>.runtime.spec.ts
test/db/invariants/<invariant>.spec.ts
test/db/runtime/fixtures.ts                  ← shared seed for runtime tests
```

One `describe` per DDL object; `beforeAll` spins the container; `beforeEach` rewinds to a per-spec checkpoint (use `SAVEPOINT` if cheaper than re-seed).

## Mandatory validation

```bash
pnpm --filter stynx-db-tests test:db
pnpm test:evidence
cat coverage/test-evidence.json | jq '.levels.integration.results[] | select(.package == "stynx-db-tests")'
```

Confirm tests count grew by the number of new `it`s and `wallMs` stays under 60s.

## Closure protocol

Append to `docs/work/plan/WAVE-03-report.md`:

```
## <schema or invariant>
- Objects covered:
  - <schema>.<function> (happy + neg)
  - <schema>.<trigger>  (verb matrix)
  - <schema>.<policy>   (RLS A vs B)
- Commit(s): <hash>
- Files added:
  - test/db/runtime/<schema>/<object>.runtime.spec.ts
  - test/db/invariants/<invariant>.spec.ts
- Deterministic anchors (if applicable): <file:line of pinned hashes>
- Container wall time: <s>
```

## Failure modes to refuse

- **Asserting against pre-computed SQL strings.** This wave is about _execution_, not text shape.
- **Using non-deterministic seeds** (e.g. `gen_random_uuid()` for canonical actors). Use the existing canonical IDs from `db/seed/00-base.sql`.
- **Skipping the negative path.** Every function with `raise exception` must have a spec that hits the raise.

## First message

State:

1. Assigned scope (schema, object, or invariant name).
2. The DDL objects you intend to cover (from your reading of `db/ddl/`).
3. Any object you think needs an Engineer assist (missing helper function, schema gap).

Wait for orchestrator's go-ahead. Then proceed.
