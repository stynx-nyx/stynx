# PORT-00 — Discovery

**Produces:** `docs/stynx/porting-pack/_DISCOVERY.md` (notes; not a final pack artifact).
**Depends on:** nothing.
**Branch:** `docs/stynx/porting-pack/00-discovery`.

## Mission

Build the grounding notes that every later prompt will reference. You
are not writing a final pack artifact yet — you are producing a
structured `_DISCOVERY.md` of _what is actually in this STYNX repo at
HEAD_. Subsequent prompts will quote this file or re-read the cited
sources directly.

## Read these, in order

1. `ls -la` at repo root. Confirm presence of `specs/`, `packages/`,
   `packages-web/`, `apps/`, `tools/`, `infra/`, `.github/`,
   `package.json`, `pnpm-workspace.yaml`, `turbo.json`. Record
   anything unexpected.
2. **Spec set** under `specs/`, in this order, end-to-end:
   - Highest-version `STYNX-SPEC-v*.md`.
   - `STYNX-API-DATA.md`.
   - `STYNX-ADR-001-soft-delete.md`, `STYNX-ADR-002-perms-caching.md`.
   - `STYNX-REFERENCE-MIGRATION.sql`.
   - `STYNX-ADOPT-EXAMPLE.md`.
   - `STYNX-CDK-SKELETON.md`.
   - Any `GAP-*.md` files.
3. **Package inventory** — for each directory under `packages/` and
   `packages-web/`:
   - `package.json` (name, version, peerDependencies, exports).
   - `src/index.ts` (or barrel) — list every exported symbol.
   - `README.md` if present.
   - One representative source file (e.g. for `@stynx-nyx/data`, read
     `database.ts` and `transaction.ts`).
4. **Reference apps** — `reference/api/` and `reference/web/`:
   - `src/main.ts` and `src/app.module.ts` (or entry equivalent).
   - One representative controller (e.g. `records.controller.ts`).
   - `migrations/0001_*.sql`.
   - `Dockerfile`, `docker-compose.yml`, `.env.example`.
5. **Migration system** — `packages/data/migrations/` and any platform
   migration. List the SQL helpers exposed (e.g.
   `data.create_soft_deletable_table`, `audit.enable_for`).
6. **Migration linter** — `tools/migration-linter/`: enumerate the lint
   rule set from source.
7. **CLI** — `packages/cli/`: list commands. Try
   `pnpm exec stynx --help` non-destructively (no migrate, no init).
8. **CI & governance** — `.github/workflows/`, `.github/CODEOWNERS`,
   `commitlint.config.*`, `.changeset/`.
9. **Prior audit** — `docs/work/audit/07-FINDINGS-REGISTER.md`.
   Discovery should note BLOCKER and MAJOR findings so later prompts
   mark unimplemented surfaces correctly (R4).

## Write to `docs/stynx/porting-pack/_DISCOVERY.md`

Sections:

1. **Repo topology** — directory listing with one-line per top-level.
2. **Spec set found** — files, versions, line counts.
3. **Invariants list** — verbatim list (e.g. I1..I8) with file:line citation.
4. **Package inventory table** — per package: name, version, exports
   count, has README, has tests, peer deps summary, maturity flag
   (STABLE / EXPERIMENTAL / NOT YET IMPLEMENTED based on tests +
   audit findings).
5. **Reference-app patterns observed** — short prose on how the
   reference-api uses `@stynx-nyx/*`, with file:line references.
6. **Migration helpers** — SQL helper signatures with file:line.
7. **Migration linter rules** — bullet list, code → description.
8. **CLI commands** — output of `--help` quoted verbatim.
9. **CI gates** — list of workflows + their purpose.
10. **Audit findings impacting the pack** — BLOCKER + MAJOR items
    from the audit register that consuming agents must know about.
11. **Open questions found during discovery** — anything ambiguous;
    these become `18-GAPS-AND-OPEN-QUESTIONS.md` candidates.

## Acceptance

- `docs/stynx/porting-pack/_DISCOVERY.md` exists.
- Every section above is populated with file-path citations.
- No prose written from prior knowledge — every fact is traceable to
  a file you opened in this prompt.
- `git diff --stat` shows changes only under `docs/stynx/porting-pack/`.

## Verify

```
ls -la docs/stynx/porting-pack/_DISCOVERY.md
grep -c '(\(see\|file:\|\.ts\|\.md\|\.sql\)' docs/stynx/porting-pack/_DISCOVERY.md
```
