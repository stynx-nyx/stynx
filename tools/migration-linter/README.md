# migration-linter

Standalone archive-aware SQL migration linter for STYNX.

CLI:

```bash
pnpm --dir tools/migration-linter exec stynx-migration-lint <migration-file-or-dir>
```

Supported flags:

- `--format=human|json`
- `--fix-suggestions`
