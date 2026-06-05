# PORT-16 — Spec Excerpts

**Produces:** `docs/stynx/porting-pack/16-SPEC-EXCERPTS/*.md` (six files).
**Depends on:** `_DISCOVERY.md`.
**Branch:** `docs/stynx/porting-pack/16-spec-excerpts`.

## Mission

Excerpt the spec into self-contained reference material. Per R7, the
consuming agent does not have the STYNX repo — it must be able to
read the same authoritative content from these files. The excerpts
are not just copy-pastes; they are condensed to remove sections
irrelevant to porting, while preserving every normative claim.

## Files to produce

Each file lives under `docs/stynx/porting-pack/16-SPEC-EXCERPTS/`. Each begins
with a header naming the source spec, the version, and the section
range excerpted.

### `invariants.md`

- Source: `specs/STYNX-SPEC-v0.6.md` §1.3 (and any cross-references).
- Content: full text of every invariant (I1..IN). Verbatim where the
  spec states the rule; condensed where it gives examples.
- For each invariant, append a "Detection" subsection sourced from
  the actual implementation (lint rule, runtime check, migration
  linter rule) — file paths required.

### `data-api-contract.md`

- Source: `specs/STYNX-API-DATA.md` §1–§7.
- Content: the @stynx/data public surface. For each section:
  module exports, Database/Transaction methods, soft-delete API,
  cascade semantics, error catalog.
- Where the spec and current code drift (per `_DISCOVERY.md`),
  prefer the code and note the drift inline.

### `soft-delete-model.md`

- Sources: `STYNX-SPEC-v0.6.md` §14, `STYNX-ADR-001-soft-delete.md`.
- Content: archive schema model, FK annotations (cascade/block/hide),
  cascade depth/row limits, restore semantics, partition rules.

### `permission-model.md`

- Sources: `STYNX-SPEC-v0.6.md` §6, `STYNX-ADR-002-perms-caching.md`.
- Content: RBAC shape (`resource:action:scope`), decorators
  (`@Permission`, `@ReadOnly`, `@Public`, `@System`), `perms_hash`,
  three-tier cache, six mutation paths that update `effective_hash`.

### `tenancy-model.md`

- Source: `STYNX-SPEC-v0.6.md` §4.
- Content: pool+RLS, the three database roles
  (`stynx_owner`, `stynx_app`, `stynx_reader`), GUC plumbing
  (`app.tenant_id`, `app.actor_id`, `app.request_id`,
  `app.session_id`, `app.archive_move`), TenantContext, resolution
  order (header → claim → subdomain), `withSystemContext`.

### `audit-model.md`

- Source: `STYNX-SPEC-v0.6.md` §9.
- Content: trigger model, GUC suppression for archive moves vs
  user-driven mutations, retention rules, LGPD-tagged 5-year
  partition, `lgpd_erasure_total&#123;table,strategy&#125;` metric.

## Rules

- **No invention.** If the spec wording is unclear, quote the
  ambiguous passage and add a `[GAP]` note for `18-GAPS-AND-OPEN-QUESTIONS.md`.
- **Cite line ranges** in the source headers (e.g. `STYNX-SPEC-v0.6.md
§1.3, lines 60–80`).
- **Stay self-contained.** A consuming agent should not need the
  original spec files.

## Acceptance

- All six files present, non-empty, well-headered.
- Each excerpt includes a "Source" header naming spec + section + lines.
- Spot-check 5 random claims per excerpt against the source — must match.

## Verify

```
ls docs/stynx/porting-pack/16-SPEC-EXCERPTS/
wc -l docs/stynx/porting-pack/16-SPEC-EXCERPTS/*.md
```
