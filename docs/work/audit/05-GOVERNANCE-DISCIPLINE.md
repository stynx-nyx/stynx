# 05 — Governance Discipline

## Code Ownership — **MAJOR**

`.github/CODEOWNERS`:

```
/packages/*       @platform-architects
/packages-web/*   @platform-architects
```

Two rules total. Coverage table:

| Path                                     | Owner                  | Status |
| ---------------------------------------- | ---------------------- | ------ |
| `/packages/*`                            | `@platform-architects` | ✅     |
| `/packages-web/*`                        | `@platform-architects` | ✅     |
| `/apps/*`                                | —                      | ❌     |
| `/tools/*`                               | —                      | ❌     |
| `/infra/*`                               | —                      | ❌     |
| `/backend/`, `/frontend/`, `/bootstrap/` | —                      | ❌     |
| `/test/*`                                | —                      | ❌     |
| `/docs/`, `/.github/`, `/specs/`         | —                      | ❌     |

Approximately **20 % of code surfaces are owned**. Per Prompt 2, the
spec-target was "1 reviewer for app code, 2 for `@stynx/*` and
`@stynx-web/*` with one platform architect" — only the second part is
expressible from this file, and only if branch-protection is configured
(it isn't — see below). FIND-024.

## Branch Protection — **MAJOR / UNKNOWN**

No `.github/branch-protection.yml` or equivalent committed config.
Branch protection may exist on the GitHub side, but it is not
declarative-in-repo — therefore not auditable from this checkout.
FIND-025.

The `gh` CLI was not invoked (would require GitHub auth; out of scope
for this read-only filesystem audit). Status: **UNKNOWN**.

## Commit Hygiene — **MAJOR**

Last 100 commit subjects analyzed against
`^(feat|fix|chore|docs|ci|build|refactor|test|perf|style|revert)(\(.+\))?!?: `:

| Outcome          | Count |
| ---------------- | ----- |
| Conventional     | 37    |
| Non-conventional | 63    |

**37 % compliance** despite a `commit-msg` Husky hook running commitlint.
Sample violations: `Small Things`, `No Patches`, `Summary`, `Step 1`,
plus dependabot bumps without consistent format. Either the hook is
being bypassed (`--no-verify`) or it's not configured to fail (config
not inspected in this audit). FIND-026.

`.husky/`:

- `pre-commit` → `pnpm exec lint-staged` ✅
- `commit-msg` → `pnpm exec commitlint --edit "$1"` ✅

Hooks are wired; enforcement is leaking somewhere.

## Changesets Discipline — **PASS (sampled)**

`.changeset/`:

- `config.json` ✅
- `status.json` (committed in worktree per `git status`)
- `v1-release-prep.md` — pending changeset for v1 release

Older changeset drafts (`stech-stynx-*.md`, `stynx-*.md`) appear in
`.release/drafts/` and are **deleted in the working tree** per `git
status` — the release-draft generator has cleared them. The
`scripts/generate-release-drafts.mjs` modification suggests the
changeset → release-draft flow is actively maintained.

PR-by-PR changeset adherence was not measured (would require sampling
20 PRs from `gh pr list`).

## RFC Process — **MINOR**

No `./rfcs/` or `./docs/rfcs/` directory exists. SPEC §17.4 describes an
RFC template and process; nothing in the repo evidences it is in use.
The `docs/work/specs/` directory contains two `STYNX-NEW-*.md` proposals
that look RFC-shaped, suggesting the convention is migrating. FIND-027.

## License Compliance — **PASS**

28 `LICENSE` files across `packages/*` (16 + the four `@stech/*` legacy)
and `packages-web/*` (10). Root `package.json` declares `MIT`. Sampling
indicates each package carries its own LICENSE. PASS.

## CI Required Checks — **PARTIAL**

`.github/workflows/`:

1. `ci.yml` — lint, typecheck, unit tests
2. `hardening.yml` — k6 / security gates
3. `release-prep.yml`
4. `release.yml`
5. `release-artifacts.yml`
6. `docs.yml`
7. `ephemeral-env.yml`

Whether each is **required** for merge is determined by GitHub
branch-protection (see FIND-025, UNKNOWN). The workflow set itself is
strong and matches the spec's CI posture (§17.5).

## Direct Pushes to `main` — **PASS**

`git log --first-parent main --pretty='%h %p %s' -50` shows linear
history; every commit has at least one parent and follows merge-commit
or rebase patterns expected of a PR-only flow. No dangling
single-parent commits without PR references were observed. PASS.

## Aggregate Governance Grade

| Item                            | Grade                             |
| ------------------------------- | --------------------------------- |
| CODEOWNERS coverage             | D                                 |
| Branch protection               | UNKNOWN (treat as F until proven) |
| Husky hooks installed           | A                                 |
| Conventional commits compliance | D (37 %)                          |
| Changesets present              | B                                 |
| RFC process                     | D                                 |
| License compliance              | A                                 |
| CI workflow set                 | B+                                |
| Direct-push violations          | A                                 |

Weighted average: **C+**. The mechanical rails are wired (hooks,
changesets, workflows) but enforcement and ownership are sparse, and
half the governance story is invisible to a read-only audit because
branch-protection is not declarative.
