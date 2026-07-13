# ADR: DEVAI CLI consumption switched from sibling-checkout to versioned npm packages

**Status:** Accepted.
**Date:** 2026-07-13.
**Author role:** Engineer, per DEVAI Constitution Article 6 (CI mechanism + dependency wiring).
**Related:** Upstream versioning policy [`../../../../devai/docs/meta/ops/versioning-policy.md`](../../../../devai/docs/meta/ops/versioning-policy.md) (D-118 — GitHub Packages is the canonical consumption model; sibling-checkout is a dev-only convenience); upstream decision log [`../../../../devai/DESIGN-DECISIONS.md`](../../../../devai/DESIGN-DECISIONS.md) D-118, D-114, D-119, D-122; `.github/workflows/devai-gates.yml`.

## Context

Since the C-4 pilot bootstrap, `devai-gates.yml` provisioned the `devai` CLI by checking out `devai-nyx/devai` as a sibling repository on every CI run, running `pnpm install && pnpm -w build`, and `pnpm link --global`-ing the result. This worked, but is the opposite of what DEVAI's own D-118 decision names as canonical: versioned GitHub Packages consumption (`@devai-nyx/cli`, pinned), with sibling-checkout reserved for local dev convenience only. Every build-from-source CI run also meant stynx never ran `devai doctor`'s `devai-version-match`/`devai-consumption-declared` checks meaningfully — `.devai/config/project.json`'s `devai_version` field sat at the decorative placeholder `"0.0.0"` indefinitely, since nothing forced it to track a real installed version.

This migration was attempted once before this ADR (commit `9d9d731b9`, reverted at `bba96f12b`). The revert happened on `codex/devai-package-consumption`, a large, separately-active feature branch carrying unrelated platform work — the branch owner reverted the devai-consumption portion of that branch's history for reasons unrelated to this decision's merits; `main` was never touched by either the switch or the revert. Recorded here so a future reader (human or agent) understands this is not the first attempt and the underlying decision was never actually contested — it just needed to land through a dedicated branch rather than a shared one.

## Decision

Switch `devai-gates.yml`'s CLI provisioning from sibling-checkout-and-build to `@devai-nyx/cli`/`@devai-nyx/schemas` installed as real `devDependencies` from GitHub Packages, and close every governance gap this unblocks:

1. **Consumption model.** `@devai-nyx/cli` + `@devai-nyx/schemas` added to `package.json` `devDependencies`, resolved via `@devai-nyx:registry=https://npm.pkg.github.com` in `.npmrc`. `devai-gates.yml`'s sibling-checkout-and-build steps are deleted entirely; the CLI resolves via `pnpm install` + a `GITHUB_PATH` append, the same way any other CLI devDependency would.
2. **`devai_consumption: "npm-package"`** declared explicitly in `project.json` (D-122) — not left to the absence-default, since the entire point of this migration is making the consumption model an auditable fact rather than an implicit assumption.
3. **`devai_version`** stamped to match the pinned CLI version, replacing the long-stale `"0.0.0"` placeholder.
4. **Constitution binding** (D-119) closed via `devai upgrade --constitution --execute` — vendors a root `CONSTITUTION.md`, refreshes the `.devai/constitution.md` stub, and writes a `constitution.{version,sha256}` pin computed from the actual vendored text (not hand-typed), replacing the stale `0.2.0` pin against a resolved `0.3.0` constitution.
5. **`devai check forbidden-actions --strict`** added as its own CI step (coverage was already 16/16 canonical locally; this makes it a CI-enforced fact instead of an untested assumption).
6. **`DEVAI_GATES_ENABLED`** repo variable flipped to `true` as the final step, once the above is verified locally — this is the first time the `devai-inventory` job (glob-guards, invariant validation, 7 sensors, blueprint validation) has ever executed for real; it was permanently gated off before.

Stack-adapter pack resolution (`--pack-tune`/`--packs-root`, used by `sense-api`/`sense-routes`/`sense-data-model`, and `devai pack-resolve`) depends on a devai-side fix landing upstream first — `examples/redox-pack-*` was not included in the published npm package as of `@devai-nyx/core@0.3.0`. That fix (and a companion `@devai-nyx/schemas` `exports`-map fix for raw schema-file access) was handled by a separate devai-focused session in parallel to this migration; this ADR's Stage 1 depends on that release being available (see the CHANGELOG entry for `@devai-nyx/core` and the version actually pinned in `package.json` for which release closed it).

## Consequences

- **CI no longer builds devai from source on every run.** Faster, and the CLI version stynx runs is exactly the pinned, published version — no drift between "what CI happens to build from whatever `main` was at checkout time" and "what's actually released."
- **`devai doctor --adopter` reaches a real 10/10 PASS** for the first time (previously 3 of 10 failing: `devai-version-match`, `constitution-binding`, `devai-consumption-declared`).
- **The `devai-inventory` CI job runs for real, for the first time.** Any latent bugs it surfaces (glob-guards, invariant schema drift, sensor findings) are now genuinely gated rather than hypothetical — this is a real behavior change for every future PR, not just a documentation update.
- **Sibling-checkout-specific tooling retires from this workflow.** `DEVAI_REPO`/`DEVAI_REF` repo variables and the `DEVAI_REPO_TOKEN` secret's git-clone use are no longer needed by `devai-gates.yml`; `DEVAI_REPO_TOKEN` is repurposed (or a differently-scoped token substituted) for `read:packages` authentication instead. GitHub Packages requires authenticated npm reads regardless of the source repo's visibility — the ambient `GITHUB_TOKEN` does not have cross-org read access to `devai-nyx`'s packages even though `devai-nyx/devai` itself is public.
- **Depends on an upstream devai release** newer than `0.3.0` for pack resolution to keep working (see Decision, final paragraph). If that release is delayed, pack-tuned sensor output either waits or (not chosen here) falls back to per-repo pack vendoring — deliberately not the path taken, to avoid stynx re-solving a problem devai itself should fix once for every adopter.

## Alternatives Considered

- **Continue building devai from source in CI.** Rejected — this is precisely the pattern D-118 names as non-canonical; every other real npm-package adopter in the devai portfolio (PEC, TEAT, SGP) already consumes this way, and staying on sibling-checkout means stynx never actually exercises the consumption model devai recommends.
- **Vendor the matched stack-adapter pack locally instead of waiting for the upstream fix.** Considered and prototyped successfully (a 116K/26-file copy of `redox-pack-nestjs-postgres-angular`) during the first attempt. Rejected for this landing in favor of waiting for the upstream `examples/` packaging fix — vendoring is a workaround every adopter would otherwise have to reinvent for themselves; fixing it once in devai benefits the whole portfolio and is already in flight in parallel.
- **Bootstrap a `decisions.jsonl` ledger entry for this decision instead of (or alongside) this ADR.** Rejected — stynx does not use that convention today (per devai's own D-123 note, `decisions.jsonl`'s `escalate` kind and the `decisions-ledger.md` `DEC-NNNN` scheme are both adopter-side conventions some repos use and others don't); adopting it wholesale for one entry is out of scope here.

## Affected Rules / References

- **Constitution Article 6** (substrate authority-by-path) — this is Engineer-authority work (CI mechanism, dependency wiring), consistent with the role declared here.
- **Constitution Article 32** (evidence) — `devai upgrade --constitution --execute` chains a `constitution.updated` record to the evidence chain as a side effect; no hand-edit of `.devai/state/evidence-chain.json`.
- **Constitution Article 36** (DEVAI applies to itself transitively) — the same reasoning that requires stynx's own governance surfaces (invariants, trace, scorecard) to track devai's real state, rather than decorative placeholders.
- **Upstream D-118** (versioning policy — GitHub Packages canonical, `devai_version` machine-managed).
- **Upstream D-119** (constitution binding — vendored-copy shape, checksum-verified pin).
- **Upstream D-122** (`devai_consumption` declaration + `devai-consumption-declared` doctor check).
- **Upstream D-124** (glob guards — already adopted in a prior session; unaffected by this migration beyond dropping `working-directory: stynx`).
- **TASK-0003** (RBAC allowlist companion-file exclusion — already closed via PR #168; unaffected by this migration).
