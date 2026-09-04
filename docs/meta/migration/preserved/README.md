# Preserved unmerged product work — STYNX 1.1.2

Set aside during the STYNX 1.2.0 DEVAI adoption migration so it is not lost.
**Not applied.** Landing it is a separate Owner sequencing decision.

## Source

| Field | Value |
| --- | --- |
| Source branch | `codex/stynx-1.1.2-inspector-prepare-3412` |
| Source tip | `b393f1e4` (worktree `stynx-1.1.2-inspector-prepare-3412`) |
| Base | `main` @ `75f8d49fba0f2418c310b62d98f50f796a33002e` |
| Patch | `stynx-1.1.2-unmerged-product-work.patch` |
| Patch SHA-256 | `1d05d69073f899ba708f0fa8df2b6ea7bc9f6dd0d894dc8e1bfaee0bdda82ea8` |
| Patch bytes | 17482 |

The source branch and `origin/codex/stynx-1.1.2-architect-6` remain intact as
git refs. Neither was pruned, deleted, or modified. This patch is a convenience
copy restricted to product paths, not the authoritative record.

## Contents — 8 files, +228 / -78

Additions and edits (product):

- `packages/data/migrations/platform/0019_auth_session_partitions.sql` (+115, new)
- `packages/data/test/integration/migrations.spec.ts` (+85)
- `reference/web/test/e2e/record-trash.spec.ts` (+20)
- `packages/data/src/migration-runner.ts` (+6)
- `packages/sessions/test/unit/session-control-depth.spec.ts` (+4)
- `packages/sessions/test/unit/session.service.spec.ts` (+4)
- `packages/sessions/src/session-mirror.writer.ts` (+1)

Deletion (**not** product — read carefully):

- `packages/contracts/stryker-setup-1.js` (-71). The source branch *removes*
  this file; it exists on `main`. It is mutation scaffolding, not product
  source. Do not treat this deletion as product work to restore. It may be
  superseded independently by the 1.2.0 mutation-roster rebind.

## Re-applying later

    git apply --check docs/meta/migration/preserved/stynx-1.1.2-unmerged-product-work.patch

Review the `stryker-setup-1.js` deletion separately before applying the whole
patch; prefer cherry-picking the product commits from the source branch:
`e971fe8e`, `3ddfb56b`, `66c1de01`, `b1d5976c`, `24c86cc2`, `07d7a549`.
