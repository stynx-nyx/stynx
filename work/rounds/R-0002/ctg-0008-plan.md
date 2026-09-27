# CTG-0008 — STYNX module generator

**Current role:** Architect. **Scope:** UPS-CLI-01, MUST under OD-S15-01. **Contract:** `docs/framework/contracts/cli-generator-1.5.md`. **Source:** DETRAN C-0002 §6.10, §7 and §8, plus its tiny `BP-OPS-EXAMPLE-001.json`, read only. No DETRAN code or generated files are copied.

## Topology

CTG-0008 follows CTG-0007. This preparation branch may contain only F1 planning. Before Inspector dispatch the maestro must record CTG-0007's merged SHA, approved prompt/delivery review receipts, and green integration gate here. If any predecessor is pending, Inspector and Engineer dispatch stop. CTG-0008 does not absorb CTG-0007 work. One triplet, one fixed-group changeset, one CTG-0008 PR after CTG-0007 merge. No release or publication action is in this scope.

| Predecessor | Merged SHA | Review receipts | Gate                       |
| ----------- | ---------- | --------------- | -------------------------- |
| CTG-0007    | Pending    | Pending         | Inspector dispatch blocked |

## Role boundaries and locks

| Task | Role      | Exclusive writable scope                                                                                                                                                     | Deliverable                                          |
| ---- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 8A   | Architect | `docs/framework/contracts/cli-generator-1.5.md`, `law/invariants/INV-CLI-001.json`, Architect-owned `law/trace.json` rebind later                                            | Final F1 contract, invariant and trace               |
| 8B   | Inspector | `packages/cli/test/**`, `test/db/**`, dedicated consumer fixture tests under `test/**`                                                                                       | Red then green sensors, real PostgreSQL RLS negative |
| 8C   | Engineer  | `packages/cli/src/**`, package manifest if necessary, a new `.changeset/*.md`, source-owned fixture bootstrap under `reference/**` only if the Inspector fixture requires it | CLI generator implementation and changeset           |

The maestro alone runs Git and records separate role commits. Inspector does not edit source, snapshots to conceal failures, F1, or generated outputs. Engineer does not edit tests or F1. Architect does not edit code or tests. The generated SQL is an **output artifact of the CLI consumer fixture**, not a new canonical `database/ddl/` migration in STYNX. If implementation adds canonical DDL, stop for Architect scope amendment and follow `docs/meta/development-contract.md`: seeds and `test/db/` coverage are required. Any generated baseline or package README is changed only through its supported tool by the proper role.

## Sequence and gates

1. Cross-family Opus prompt-review reads this plan, contract and prompts 90–93 before any worker dispatch. Record a JSON PASS/REVIEW/FAIL receipt. Up to two REVIEW repair cycles; FAIL or exhausted review returns to the human.
2. Architect 8A confirms the subset against current STYNX public APIs and the DETRAN sample, then writes `INV-CLI-001` with atomic security and reproducibility claims. The proposed contract is not ratified until this checkpoint. No unreviewed expansion to the 50 DETRAN blueprints.
3. After CTG-0007 integrated evidence is filled above, Inspector 8B writes tests first. The tiny sample is the positive fixture; malformed JSON, unsupported dialect, unsafe names/paths, collision, output failure, double slash, metadata non-effect, deterministic bytes, `--check`, published import, and real PostgreSQL tenant isolation are negative/positive probes. Run focused tests and report expected red without weakening existing sensors. Architect rebinds trace after `pnpm check:trace --print` in a separate F1 commit.
4. Engineer 8C implements only the approved contract against those tests. Build a preflight plan before writes, stage to a sibling directory, refuse every existing destination, and generate from validated data. Add one fixed-group changeset and update the CLI package README through package tooling. No DETRAN helper reuse. If CLI package dependencies/lockfile change, coordinate hash sensors and use frozen install.
5. Run focused CLI tests, generated consumer package typecheck/build and Nest route test, PostgreSQL RLS negative against two tenants, `pnpm check:rls-negative`, `pnpm check:rls-smoke`, CLI lint/typecheck/build, `pnpm ci:stynx`, `pnpm ci:reference-apps`, trace, package README and API baseline checks, DEVAI forbidden strict, and cross-family delivery-review PASS. A missing database is an unobserved result. Review output diff/manifest and confirm `--check` is byte-stable. Merge only after CTG-0007 and remote CI are green.

## Acceptance evidence

The CLI command exists in help and uses `--blueprint` plus required `--out`; the sample generates a repository, protected list/get controller, RLS DDL, and manifest in a fresh directory. Generated code uses `Database.tx(..., { role: 'app' })`, `Transaction.query`, trusted `RequestContext`, and bound parameter values. Direct `stynx_app` SQL with tenant A cannot read or mutate B's row; missing tenant context fails closed. Every generated table has FORCE RLS and both policy predicates. Invalid paths, SQL tokens, unknown keys, unsafe defaults, existing output, symlink components, and partial failures leave no target output. Repeated generation in two absent destinations yields identical relative file bytes. `--check` detects modification, addition and removal and does not write. The installed/published CLI consumer fixture imports package exports rather than source paths.

## Triagem

No failure classified before dispatch. Each failure entering feedback is classified `plant-bug`, `sensor-error`, `policy-issue`, or `reference-gap` and routed under the authority chain; no role edits its own reference to make a gate pass.

## Resume state

Contract, plan and prompts are proposed. Await prompt-review PASS, Architect invariant checkpoint, and CTG-0007 integration receipt before Inspector dispatch. No implementation, tests, PR, merge, versioning, or publication is authorized by this plan alone.
