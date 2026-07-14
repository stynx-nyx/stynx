# STYNX Database Layout

STYNX uses the cross-repo canonical `database/` layout.

## Bootstrap Order

1. `database/ddl/*.sql` in lexical order: fresh-database DDL.
2. `database/migrations/*.sql` in lexical order: incremental migration support files.
3. `database/seed/*.sql` in lexical order: deterministic seed data.

Current bootstrap DDL:

- `database/ddl/00-extensions.sql`
- `database/ddl/01-auth.sql`
- `database/ddl/02-audit.sql`
- `database/ddl/03-storage.sql`

Current migration support:

- `database/migrations/000_migrate-check-preseed.sql` prepares roles and default privileges for `devai sense migrate check --pre-seed`.

Current seeds:

- `database/seed/00-base.sql`

`scripts/db-reset.sh`, `scripts/check-rls-smoke.sh`, `scripts/list-ddl-objects.mjs`, and `test/db/` are the local callers for this layout. Domain-scaffolded modules may still carry module-local migration fixtures under `domain/<module>/db/`; those are not part of the root bootstrap sequence.
