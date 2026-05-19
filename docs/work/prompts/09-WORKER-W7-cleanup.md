# Worker Prompt — Wave 07 (Cleanup)

## Runtime

- **Tier:** light-to-medium reasoning. The work is largely mechanical (deletes, moves, doc edits). The risk is _missing_ a hidden coupling, which careful pre-flight grep mitigates.
- **Claude Code:** `claude --model claude-haiku-4-5-20251001 --permission-mode acceptEdits -p "$(cat docs/work/prompts/09-WORKER-W7-cleanup.md)\n\nScope: <W7.1|W7.2|...>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort low --sandbox workspace-write -- "$(cat docs/work/prompts/09-WORKER-W7-cleanup.md)\n\nScope: <W7.1|W7.2|...>"`
- **Upgrade to medium** (`claude-sonnet-4-6` / `--reasoning-effort medium`) for W7.2 (folding `test/packages/` back) and W7.6 (documentation refresh) — both require judgement calls about coupling and tone.

You are a worker assigned to **one cleanup category** under Wave 07 (W7.1 – W7.6). The orchestrator will tell you which.

## Authority (Article 6)

| Category                         | Authoring role                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| W7.1 Delete fake `*.e2e-spec.ts` | Inspector (deletions); Engineer (`package.json#scripts.test:e2e` adjustments).                   |
| W7.2 Fold `test/packages/` back  | Inspector (file moves between `test/packages/<dir>/*.spec.ts` → `packages/<pkg>/test/unit/`).    |
| W7.3 Retire `test/backend/`      | Engineer (`rm -rf` + remove workspace registration if any).                                      |
| W7.4 Rename DDL "shape" tests    | Inspector.                                                                                       |
| W7.5 Sweep dev-only comments     | Engineer / Inspector mixed; one PR per file.                                                     |
| W7.6 Documentation refresh       | Architect (`AGENTS.md`, `README.md`, `docs/KNOWN_GAPS.md`, `docs/work/inv/`, `docs/work/diag/`). |

## Reading list

1. `docs/work/plan/WAVE-07-cleanup.md` — the wave.
2. The files in your category, listed in the wave document.
3. The corresponding "real" coverage from Waves 02 / 03 / 04 / 05 — confirm the legacy can be deleted without losing coverage.

## Process

### W7.1

- For each fake `*.e2e-spec.ts`: confirm the replacement coverage (from W4 backend or web flows) is in place. If yes, delete. If no, escalate.
- Update each affected `package.json#scripts.test:e2e`: either delete the line or point to a real new suite.
- Confirm `pnpm -r --filter "./packages/*" run test:e2e` no longer prints "removed during V6 cutover".

### W7.2

- For each file in the move table from the wave doc:
  - Confirm the destination's existing tests don't already cover the same code (use `git diff` to compare assertions).
  - Move the file. Update its imports relative to the new location.
  - Run the destination package's `test` and `test:int` suites to confirm green.
- Delete now-empty subdirectories under `test/packages/`.
- Keep `test/packages/support/` if helpers are shared; otherwise move helpers into `@stynx/testing`.

### W7.3

- Confirm `test/backend/{e2e,support,unit}` is empty (it should be).
- `rm -rf test/backend`.
- Update `pnpm-workspace.yaml` if `test/backend` was registered (verify it isn't).

### W7.4

- Move `test/db/{auth,audit,storage}.ddl.spec.ts` → `test/db/ddl/<schema>.shape.spec.ts`.
- Update imports in any spec that referenced the old path.

### W7.5

- `git grep -nE 'TODO.*convert.*vitest|removed during V6 cutover|// pre-Phase'`.
- For each match: either resolve (fix the code, delete the comment) or convert to a tracked issue with a reference comment.

### W7.6

- Update `AGENTS.md`'s testing-section table.
- Update `README.md`'s test-section table.
- Update `docs/KNOWN_GAPS.md` — remove rows that the programme closed (e.g. F-03).
- Update `docs/work/inv/` and `docs/work/diag/` — either rewrite as "current state" or freeze with a "superseded by …" header. Choose one and commit to it consistently.

## Mandatory validation

After your category lands:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm test:int
pnpm test:e2e
pnpm test:matrix --compact
pnpm doctor
```

All must exit 0.

Then verify category-specific:

| Category | Verification                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| W7.1     | `find . -name '*.e2e-spec.ts' -not -path '*/node_modules/*'` returns only files in `reference/*/test/e2e/` (and zero if you've also renamed to `*.spec.ts`). |
| W7.2     | `find test/packages -name '*.spec.ts' -not -path '*/node_modules/*'` returns only true cross-package invariants (if any).                                    |
| W7.3     | `test -d test/backend` returns 1 (directory deleted).                                                                                                        |
| W7.4     | `find test/db -name '*.ddl.spec.ts'` returns nothing; `find test/db/ddl -name '*.shape.spec.ts'` returns the three renamed files.                            |
| W7.5     | `git grep -nE 'TODO.*convert.*vitest                                                                                                                         | removed during V6 cutover'` returns nothing. |
| W7.6     | The four docs are coherent; `docs/KNOWN_GAPS.md` no longer claims gaps that the programme closed.                                                            |

## Closure protocol

Append to `docs/work/plan/WAVE-07-report.md`:

```
## W7.<n> — <category>
- Files deleted: <count>; full list: <pasted>
- Files moved: <count>; source → destination pairs: <pasted>
- Validation outputs: <pasted excerpts>
- Commit(s): <hash>
- Notes: <e.g. "identity-admin specs deleted — confirmed @stynx/identity-admin was retired in commit X">
```

## Failure modes to refuse

- **Deleting a `*.e2e-spec.ts` without confirming the replacement.** The wave depends on W4 closure.
- **Moving a spec and leaving the duplicate behind.** Either it moves cleanly or it doesn't move.
- **Editing `CLAUDE.md`** — the file is shared with DEVAI and should not be touched in this wave.

## First message

State:

1. Your assigned category.
2. The files you intend to delete / move (full list, with destinations where applicable).
3. The replacements you've confirmed (commit hashes from the relevant waves).

Wait for orchestrator's go-ahead. Then proceed.
