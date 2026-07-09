# PORT-04 — Invariants and Contracts

**Produces:** `docs/stynx/porting-pack/04-INVARIANTS-AND-CONTRACTS.md`.
**Depends on:** `_DISCOVERY.md`, `16-SPEC-EXCERPTS/invariants.md`.
**Branch:** `docs/stynx/porting-pack/04-invariants`.

## Mission

The non-negotiable rules. A consuming agent reading this file must
be able to: (a) state every invariant from memory, (b) detect a
violation in the foreign codebase via grep or lint, (c) rewrite the
violation to comply.

## Read

- `16-SPEC-EXCERPTS/invariants.md` (already produced by PORT-16).
- `tools/migration-linter/src/` — actual rule implementations.
- `tools/eslint-config/` — ESLint rules enforcing invariants.
- `packages/data/src/database.ts`, `transaction.ts` — runtime
  enforcement points.
- `packages/auth/src/` — `@Permission` / `@ReadOnly` / `@Public` /
  `@System` decorators and their guards.

## Structure

```
# 04 — Invariants and Contracts

## Why this document exists

[2 sentences]

## The invariants (I1..IN)

For each invariant:

### I<n> — <name>

- **Statement:** <verbatim or near-verbatim>
- **Why it exists:** <1–2 sentences>
- **Detection:** <how the consuming agent verifies a port satisfies
  it — cite the lint rule, runtime check, or test matcher with file
  path>
- **Common violations to grep for in the foreign codebase:**
  - `<grep pattern>` → rewrite as `<correct pattern>`
  - …

## Cross-cutting contracts

### HTTP route contract
[every route has @Permission/@Public/@System; how doctor enforces it]

### Database access contract
[no raw pool, all goes through @stynx-nyx/data; ESLint rule path]

### Audit contract
[every mutation @Audit or @NoAudit('reason'); migration linter rule]

### Soft-delete contract
[archive mirror + no deleted_at on live; cite helper SQL]

### LGPD contract
[PII map entries; erasure strategies; archive participation]
```

## Rules specific to this artifact

- For each invariant's "Common violations" subsection, give at least
  two concrete grep patterns the consuming agent can run on the
  foreign codebase to find violators. Patterns must be precise
  enough not to flood with false positives.
- The detection subsection must cite a _real_ enforcement mechanism
  (or mark `[NOT YET IMPLEMENTED]` per R4 if the audit found the
  enforcement is broken — see audit FIND-004 for the migration
  linter regression).

## Acceptance

- One subsection per invariant; none missing.
- Every "Detection" entry cites a file path.
- Every "Common violation" entry has a runnable grep pattern.
- "Cross-cutting contracts" section covers HTTP, DB, audit,
  soft-delete, LGPD at minimum.
