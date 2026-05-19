# Worker Prompt — Wave 05 (Mutation)

## Runtime

- **Tier:** high reasoning. Hunting surviving mutants is the hardest single-package work in this programme; each survivor's "killing spec" requires deep source comprehension.
- **Claude Code:** `claude --model claude-opus-4-7 --permission-mode acceptEdits -p "$(cat docs/work/prompts/07-WORKER-W5-mutation.md)\n\nScope: <package>"`
- **OpenAI Codex CLI:** `codex exec --model gpt-5-codex --reasoning-effort high --sandbox workspace-write -- "$(cat docs/work/prompts/07-WORKER-W5-mutation.md)\n\nScope: <package>"`
- **Long runtime:** a single Stryker cycle can take 10–30 min per package on the security-tier surfaces. Budget the runtime accordingly; do not pre-empt the session.
- **Incremental cache:** confirm `.stryker-tmp/incremental.json` is present from a previous run before starting (it accelerates focused re-runs by 5–10×).

You are a worker assigned to **one package** under Wave 05. The orchestrator will tell you which.

## Authority (Article 6)

You operate as **Inspector** (authoring `*.spec.ts` to kill surviving mutants). If a mutant survives only because a `// stryker:disable next-line` is needed for a genuinely-equivalent mutation, the disable comment goes in `test/` annotations, not `src/`. Engineer assists are rare here.

## Reading list

1. `docs/work/plan/WAVE-05-mutation-completeness.md` — the wave.
2. `packages/<pkg>/stryker.conf.mjs` — the configured `mutate:` list.
3. `packages/<pkg>/reports/mutation/<pkg>/index.html` — the latest run's per-file/per-mutant report.
4. The source files mentioned in `mutate:`.

## Process

1. **Baseline.** Run `pnpm --filter <pkg> stryker`. Capture the score, the surviving-mutant count, and the timeout count.
2. **Identify hot zone.** Open `reports/mutation/<pkg>/index.html` → "Surviving mutants" tab. Group by file. Pick the file with the most survivors.
3. **Read each survivor.** Stryker shows the mutation diff (e.g. "removed `>` in `a > b`"). Determine:
   - Is the survivor truly a behaviour gap? Almost always: yes.
   - Is the survivor an equivalent mutation? Rare but real. If so, annotate with `// stryker:disable next-line <Mutator>` and a one-line justification.
4. **Write a killing spec.** Author a test that, _under the surviving mutation_, would fail. Verify by temporarily applying the mutation by hand and confirming red, then reverting.
5. **Iterate.** Re-run `pnpm --filter <pkg> stryker --files src/<hot-file>` (focused mode). Repeat until the file's score crosses the package threshold.
6. **Repeat across files** until the package's overall score crosses the threshold-roadmap target.

## Threshold target

Per `docs/work/plan/WAVE-05-mutation-completeness.md#W5.3`. Pull your package's target row from there.

## Mandatory validation

```bash
pnpm --filter <pkg> stryker
pnpm test:evidence
cat coverage/test-evidence.json | jq '.levels.mutation.results[] | select(.package == "<pkg>")'
```

The score must clear the configured `thresholds.break`. Confirm `survived + timeout` is meaningfully lower.

## Closure protocol

Append to `docs/work/plan/WAVE-05-report.md`:

```
## <package>
- Score before → after: <a>% → <b>%
- Survivors killed: <n>
- Equivalent mutations annotated: <n> (with file:line list)
- New specs:
  - test/unit/<file>.spec.ts: 3 specs killing branches in src/<file>.ts:LL-MM
- Commit(s): <hash>
- Stryker wall time: before <s> → after <s>
- Notes: <e.g. "two timeouts in sessions/jwks-rotation came from a 30s timeout in the spec — patched to use vitest's fake timers">
```

## Failure modes to refuse

- **Adding `// stryker:disable` to a _reachable_ mutation without justification.** The justification line must explain _why_ the mutant is equivalent.
- **Padding the spec count with no-op `it`s.** Each new spec must kill at least one named mutant.
- **Disabling the threshold to ship.** Threshold ratchet is per the plan; downward moves are not allowed without an ADR.

## First message

State:

1. Assigned package + current score.
2. Top hot-zone file (most survivors).
3. Estimated new spec count.
4. Any timeout/error mutants that need an Engineer assist.

Wait for orchestrator's go-ahead. Then proceed.
