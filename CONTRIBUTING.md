# Contributing

STYNX uses Conventional Commits for local commits and pull request titles. Run
the normal hooks and CI gates before asking for review:

```bash
pnpm lint
pnpm typecheck
pnpm -r --if-present test --silent
```

## Hook Policy

Do not use `--no-verify` for routine work. Bypassing hooks is allowed only for
urgent production hotfixes, and the bypass must be backed by an explicit ADR or
incident record that explains why the normal gate could not run first.

Any follow-up commit after a bypass must restore the skipped evidence.
