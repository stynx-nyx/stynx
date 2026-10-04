# STYNX: adopt DEVAI 1.9.0 (plan)

Status: executed on 2026-10-04 under ADR-DEVAI-ADOPTION-0010 with Owner decisions D1-D6; corrections found during execution are listed in section 6. Baseline is `main` at `f88cd871`, which matches origin. Source facts come from DEVAI tags `v1.6.0..v1.9.0` and this tree.

## 1. What changes between 1.6.0 and 1.9.0 for STYNX

| Area                                                      | 1.9.0 behaviour                                                                                                                                                            | STYNX impact                                                                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI, engines, deps                                        | No commands added or removed; node `>=24`, same deps                                                                                                                       | Pin bump only; no upgrade command, so we re-run the `init bind` segments                                                                                                                                         |
| `init bind --adopter-policy` (1.7.0, ADR-CFG-0002)        | An ownership matrix replaces the deep merge. Owned keys the source no longer declares are **retired** (`/ci_economy/attested_rc`, `/repo`, `/docs`). Writes `retired_keys` | **Blocker.** `law/policy/devai-adoption.json` has no `ci_economy`, so the bind would delete `attested_rc` from `project.json`. The source must declare it first, as top-level `ci_economy` (not under `project`) |
| Constitution (1.8.0, ADR-GOV-0024)                        | 1.0.2 (Article 6 client extensions); sha256 `d7f8791f…f957d`                                                                                                               | The 1.0.1 pin is still accepted (`upstream_ahead` note), but full adoption means rebinding to 1.0.2                                                                                                              |
| `authority` block (1.8.0, ADR-AUT-0003)                   | Optional; needs constitution ≥ 1.0.2                                                                                                                                       | Not adopted unless the Owner decides otherwise (decision D2)                                                                                                                                                     |
| `forbidden-actions.json`                                  | Adds `maintenance_exemptions`: append-only edits to `law/policy/forbidden-action-authorizations.json` are exempt from FORBID-MUTATE-INVARIANTS                             | Vendored copy changes; receipt-only commits stop needing receipts                                                                                                                                                |
| `subprocess-effects.json`                                 | 8 new templates, `argv_precedence`                                                                                                                                         | Vendored copy changes                                                                                                                                                                                            |
| `thresholds.json` (1.9.0)                                 | New strict schema; `soft_gate` required, with const floors                                                                                                                 | Materialized file gains `soft_gate`. The STYNX override (`lint` only) stays valid                                                                                                                                |
| `scorecard-na.json` (1.7.0)                               | Default lists F4:T5; the runtime `DEGENERATE_CELLS` list is gone                                                                                                           | The STYNX source declares `cells: []`, which **replaces** the default, so F4:T5 becomes scoreable unless we add it                                                                                               |
| Check applicability (1.7.0, ADR-CHK-0005)                 | `action-effects`, `cli-reference` and `prompt-overlays` return `na` in adopters; repo kind comes from the binding receipt                                                  | Confirm that no STYNX gate requires `ok:true` from those members                                                                                                                                                 |
| Evidence anchoring (1.9.0, ADR-EVI-0002/0005)             | `evidence verify --scope chain` needs `record/proofs/anchor-baseline.json`; unanchored lines need Architect `historical-gap` declarations                                  | 5 legacy lines in `record/proofs/work/generic/R-000{1,2}.jsonl` need anchoring or gap declarations (decision D4)                                                                                                 |
| Verifier, hooks, workflow templates                       | Verifier still `1.5.4`; `devai-local-rc-verify.yml`, hooks and adapter generators are byte-identical                                                                       | No workflow change is expected. Adapter configs still stamp the version and need a rebind                                                                                                                        |
| `sense run --preset=<x>`, `evidence render --kind rounds` | Refused, or changed meaning                                                                                                                                                | STYNX uses neither (to be confirmed by grep in step 0)                                                                                                                                                           |

## 2. Stale artifacts to remove or refresh, so no version mixing remains

| Artifact                                                                                       | Current state                                                                                                        | Action                                                                  |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `.devai/config/github-actions-host-adapter.json`                                               | Stamped 1.4.5; binds `devai-main-observation.yml`, which no longer exists                                            | D3: rebind at 1.9.0 and re-create the workflow                          |
| `.devai/config/post-merge-host-adapter.json`                                                   | Stamped 1.2.0-rc.3; absolute `/Users/…/stynx-devai-1.2.0-rc.3-trial` paths                                           | Rebind with `--host-adapter post-merge` at 1.9.0                        |
| `.devai/constitution.md`                                                                       | "Generated by DEVAI v1.4.5"                                                                                          | Regenerated by `--constitution`                                         |
| `record/derived/inventory/README.md`, `record/proofs/README.md`, `scratch/worktrees/README.md` | "Generated by DEVAI v1.2.13"                                                                                         | Refresh the stamp, or regenerate if `init` can                          |
| `law/trace.json:21` provenance                                                                 | "DEVAI 1.2.13"                                                                                                       | Update during the Architect trace rebind                                |
| `law/invariants/README.md:4`                                                                   | "validates against DEVAI 1.1"                                                                                        | Update                                                                  |
| `scripts/verify-devai-trace.mjs:4`                                                             | Comment cites a DEVAI 1.4.5 gap                                                                                      | Re-verify whether 1.9.0 checks `assertion_count`; reword or retire      |
| `scripts/lint-workflows.mjs:11,67-80`                                                          | Dead special case for `devai-main-observation.yml`                                                                   | Keep; the workflow is re-created per D3                                 |
| `law/policy/retired-governance-catalog.json:11-78`                                             | Lists re-created files (`devai-local-rc*`, `verify-devai-trace.mjs`) as retired; says nothing reads `law/trace.json` | Correct the entries                                                     |
| `test/scripts/devai-1.5-adoption-contract.test.mjs`                                            | Filename says 1.5, content asserts 1.6.0                                                                             | Rename to `devai-adoption-contract.test.mjs` and move its trace binding |
| `test-tasks.json:3` `descriptorVersion` `stynx-devai-1.5.0-v1`                                 | Naming only                                                                                                          | D5: rename to `stynx-devai-1.9.0-v1`                                    |
| `law/policy/devai-adoption.json` `policy_version` 1.3.0                                        |                                                                                                                      | Bump to 1.4.0 with the `ci_economy` and F4:T5 additions                 |
| Historical ADRs, migration docs, CHANGELOGs, `.devai/state/{rgr,tasks}`, proof chain           | Old versions are historical record                                                                                   | **Keep byte for byte.** Never rewrite proofs                            |

Transient files that must never be committed: `.devai/config/adopter-policy-binding.journal.json` and `*.devai-bind-staged`.

## 3. Owner decisions (recorded 2026-10-04)

- **D1, constitution 1.0.2: adopt.** Rebind with `--constitution`.
- **D2, `authority` extension block: not adopted now.** Any future adoption gets its own ADR.
- **D3, GitHub Actions observation adapter: rebind, then re-create `.github/workflows/devai-main-observation.yml`** from the 1.9.0 generator. This needs an Owner `FORBID-CI-WITHOUT-ADR` receipt for the exact commit, and the ADR must cite it. Keep the `scripts/lint-workflows.mjs` special case for this workflow, and correct its retired entry in `retired-governance-catalog.json`.
- **D4, legacy proof lines: record Architect `historical-gap` declarations** for the 5 lines in `record/proofs/work/generic/R-000{1,2}.jsonl`, then write the anchor baseline.
- **D5, renames: do them.** Rename `devai-1.5-adoption-contract.test.mjs` to `devai-adoption-contract.test.mjs`, and `test-tasks.json` `descriptorVersion` to `stynx-devai-1.9.0-v1`.
- **D6, `CLAUDE.md` to `@AGENTS.md`: do it.** First move the STYNX-specific guidance in `CLAUDE.md` ("What DEVAI enforces and what STYNX enforces itself") into `AGENTS.md`.

Upstream: requested an adopter upgrade command in aarusso-nyx/devai#264.

## 4. Execution sequence (one PR, role-scoped commits)

Each commit touching `law/` or `.devai/config/` needs an exact-SHA Owner FORBID-MUTATE-INVARIANTS receipt. Appending receipts is exempt from 1.9.0 onwards, but the receipt commit for the bump itself is checked by the 1.6.0 hook until the pin lands. Never bypass the git hooks.

0. **Preflight (no commit).** Grep for `--preset=`, `evidence render`, `kind: class`, and `ok:true` gating of `action-effects`/`cli-reference`/`prompt-overlays`. Fetch the 1.9.0 tarball identity: tarball, SRI, sha1, sha256, source commit, tree and signed tag. Confirm that `dist/runtime/evidence-verification/{provenance.json,src/export-cli.js,src/publish-cli.js}` still exist, and that the `devai check` JSON envelope still matches `scripts/lib/devai-local-rc.mjs` `unwrapDevaiCheckReport`.
1. **Architect, `law/`.**
   - Add ADR `law/adr/2026-10-04-devai-1.9.0-adoption.md` (ADR-DEVAI-ADOPTION-0010, superseding 0005's identity) and its `law/adr/README.md` entry.
   - In `law/policy/devai-adoption.json`: add top-level `ci_economy.attested_rc` (byte-equal to the current `project.json` block) and the F4:T5 `scorecard_na` cell, then bump to 1.4.0.
   - Update `law/policy/devai-package-identity.json` to the 1.9.0 identity.
   - Correct `retired-governance-catalog.json` and `law/invariants/README.md`.
2. **Engineer, pin.** Set `package.json` `@aarusso-nyx/devai` to `1.9.0`, run `pnpm install`, and commit the lockfile. Run `pnpm security:sbom` and commit `docs/meta/security/sbom.cdx.json`. Check whether a changeset is needed; the root package is not in the fixed group, so most likely not.
3. **Architect, rematerialize `.devai/`** with the installed 1.9.0 CLI, in this exact order:
   ```
   devai init bind --target . --tier tier1 --constitution --as-role architect --write
   devai init bind --target . --operational-law --as-role architect --write
   devai init bind --target . --subprocess-effects --as-role architect --write
   devai init bind --target . --adopter-policy law/policy/devai-adoption.json --as-role architect --write
   devai init bind --target . --as-role architect --write
   devai init bind --target . --host-adapter github-actions --as-role architect --write   # D3, then re-create the observation workflow (Owner CI receipt)
   devai init bind --target . --host-adapter post-merge --as-role architect --write
   devai init apply harness --target . --include ci --force                               # expect zero diff
   ```
   `--adopter-policy` must run **after** `--operational-law`, which overwrites the projections. Then check the results:
   - `project.json` has `devai_version` 1.9.0, constitution 1.0.2, and `attested_rc` intact.
   - `adopter-policy-binding.json` has **no** `retired_keys`.
   - Doctor reports `policy-materialization-current` OK.
   - `git status` shows no journal or staged files.
   - Reinstall the husky blocks with `devai hooks install`. A no-op diff is expected; the post-merge digest is bound in the adapter.
4. **Inspector, tests.**
   - Rename and update the adoption contract test: 1.9.0 identity, constitution 1.0.2 digest, and re-read the package `release-lifecycle.json`/`mutation-strength.json` assertions. The verifier stays 1.5.4.
   - Update the `test/scripts/validate.js:714-801` identity and lockfile substrings.
   - Rebind the `package.json` SHA-256 at `local-rc-blocker-contract.test.mjs:4333,4506,4568`. The new normalized digest for a pin-only change is `2d905350…3af7`; recompute it after the final `package.json`.
5. **Architect, trace.** Run `pnpm check:trace --print` and rebind `law/trace.json` for the renamed and edited tests. Refresh the provenance string at line 21.
6. **Architect, evidence (D4).** Record `historical-gap` declarations, then `devai evidence verify --scope chain --write` to create `record/proofs/anchor-baseline.json`.
7. **Engineer, cleanup.**
   - Keep the `lint-workflows.mjs` observation-workflow branch (D3), reword `verify-devai-trace.mjs`, and refresh the "Generated by DEVAI v1.2.13" stamps.
   - Update `AGENTS.md`/`CLAUDE.md` to 1.9.0 and constitution 1.0.2, per D6.
8. **Owner receipts.** Append receipts for every governed commit SHA (append-only, now exempt).

## 5. Verification gates

- `pnpm devai:doctor`: all checks OK, no `upstream_ahead` note, `policy-materialization-current` OK.
- `devai check --only forbidden-actions --strict --since-ref origin/main` is clean.
- `pnpm --dir test/scripts test` (node tests and `validate.js`), `pnpm check:trace`, `pnpm security:sbom:check` and the full `ci:stynx`.
- `devai evidence verify --scope chain`: no `PROOF_ANCHOR_BASELINE_MISSING`, and no orphans.
- Run the stale-version sweep below. It must return only historical files (ADRs ≤ 0006, migration docs, CHANGELOGs, `.devai/state/{rgr,tasks}`, proofs) plus the intended verifier `1.5.4` pins:
  ```
  git grep -nE 'DEVAI v?1\.[0-8]\.|devai[^ ]*1\.[0-8]\.[0-9]' -- ':!pnpm-lock.yaml'
  ```
- Run `pnpm devai:rc:prepare` and `pnpm devai:rc:publish` on the final tree, which yields the `verified-local-rc` check on the PR. Expect a cold RC cache.

## 6. Execution corrections (2026-10-04)

- **ADR number.** ADR-DEVAI-ADOPTION-0007 to 0009 were already taken, so the adoption ADR is 0010.
- **`ci_economy` source path.** The 1.9.0 adopter-policy schema keeps `project` closed. `ci_economy` is a top-level member of the source, and the ownership matrix reads `/ci_economy` from there.
- **Host adapter order.** `docs/adopters/install.md` binds GitHub Actions and then post-merge, which makes the checkout-bound post-merge adapter the selected identity. Doctor then fails `POST_MERGE_ADAPTER_BINDING_MISSING` at every other path, including CI's observation workflow. With the Owner's approval, STYNX binds post-merge first, GitHub Actions last and the adopter policy after both, from the primary checkout (`/Volumes/Thiamat II/stech/stynx`). Doctor exits 0 at a foreign path. Upstream: aarusso-nyx/devai#266.
- **`init apply harness --include ci --force` is destructive here.** It would replace `.gitignore` with one line and reset the `domains.json` client projection, so it was not run on the tree. In a throwaway worktree the CI workflow output was byte-identical. Only its four refreshed scaffold stamps were taken: `.devai/constitution.md`, `record/derived/inventory/README.md`, `record/proofs/README.md` and `scratch/worktrees/README.md`.
- **New 1.9.0 docs rule.** `docs-ia.workflow-page-set` requires one page per workflow but hardcodes `docs/dev/operations/workflows/`, ignoring the STYNX `dev/operations -> meta/ops` override. With the Owner's approval, the pages live in `docs/meta/ops/workflows/`, and the rule stays an advisory doctor finding until upstream aarusso-nyx/devai#265 is fixed. Doctor still exits 0.
- **Re-created workflow.** `devai init bind --host-adapter github-actions` re-creates `.github/workflows/devai-main-observation.yml` itself, byte-identical to the retired file (sha256 `00a02fba…`).
- **Legacy proof lines.** The baseline showed only the three R-0001 lines orphaned; the two R-0002 lines were already anchored. One historical-gap declaration in `record/proofs/work/historical-gap/R-0002.jsonl` covers the three, and the chain verifies.
- **Receipt exemption in tests.** The 1.9.0 append-only exemption flipped three forbidden-action fixtures in `test/scripts/validate.js`. The Inspector re-pinned them to the new rule and kept the mixed-commit finding by using a governed extra path.
- **Trace check.** `devai check --only trace` reports six errors (`run-integration.mjs` containment and the `meta.last_updated` date format) that exist identically on `main` under 1.6.0. They are out of scope here.
