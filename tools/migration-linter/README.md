# `@stynx-internal/migration-linter`

Standalone archive-aware SQL migration linter for stynx.

## CLI

```bash
pnpm --dir tools/migration-linter exec stynx-migration-lint <migration-file-or-dir>
```

Supported flags:

- `--format=human|json`
- `--fix-suggestions`

## Status: intentionally stynx-idiosyncratic

> **C-4 Session S9 (post-21 stynx adoption pilot, 2026-05-16).** This tool is **NOT folded into DEVAI's `check-*` family** and is **not planned to be**.

### Why this is stynx-only

DEVAI's `check-*` actions (`check-adrs`, `check-forbidden-actions`, `check-overrides`, `inv-contracts`, etc.) all operate against DEVAI substrates with universal semantics. The migration-linter, by contrast, encodes stynx-specific SQL conventions:

| Rule family                             | Stynx-specific because…                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `archive-table` invariants              | Stynx's soft-delete pattern uses paired `core.create_soft_deletable_table()` + archive table; not a DEVAI concept. |
| Tenant-column enforcement (`tenant_id`) | Stynx RLS pattern is opinionated; DEVAI's invariants speak about _whether_ tenancy is enforced, not _how_.         |
| `core.pii_map` insert recognition       | Stynx-specific runtime registry; DEVAI's `sense-data-handling` reads pii heuristically, not via this table.        |
| `data.create_*` helper enforcement      | Stynx data-layer helpers in `@stynx/data`.                                                                         |

These rules would be noise (or worse, contradiction) for any non-stynx adopter of DEVAI. Pulling them into DEVAI's universal check-\* family would violate Article 6's substrate-authority discipline.

### When DEVAI ships a generic SQL-pattern check action

If a future DEVAI phase ships `check-migrations` or `sense-migrate-check` enhancement that lets adopters configure stack-specific SQL patterns (similar to how `extractor_params` configures `sense-data-model`), then it may make sense to:

1. Migrate stynx-generic rules (e.g. "every migration has a header comment with version + sha") into the DEVAI generic action.
2. Keep stynx-idiosyncratic rules here.
3. Wire stynx's CI to run both: DEVAI's generic action + this one.

That would be a Phase G.3 / Phase H opportunity. Until then, this linter stays where it is.

### Audit trail

The decision to keep this stynx-idiosyncratic was made in C-4 Session S9. Per Phase A retro §6 "Skills consolidation audit," the equivalent decision was already made for `.codex/skills/npm-security-upgrade-auditor/` (kept idiosyncratic). This README captures the same pattern for `tools/migration-linter/`.

## Active rules

(See `src/lint.ts` for the canonical list. As of 2026-05-16, the rule set is stable; no rule changes are expected before stynx 1.0.)
