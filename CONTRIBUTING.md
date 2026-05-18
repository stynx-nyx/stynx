# Contributing

STYNX accepts the same two subject shapes for local commits and pull request
titles:

- DEVAI role-prefix subjects, for example `Engineer: close migration gate`.
- Conventional Commits, for example `fix(repo): close migration gate`.

Run the normal hooks and CI gates before asking for review:

```bash
pnpm lint
pnpm typecheck
pnpm -r --if-present test --silent
```

The authoritative parser is `tools/repo-config/commitlint.config.cjs`; the PR
title workflow pipes the title through that same config so role-prefix work is
not blocked by a separate conventional-only rule.

## Hook Policy

Do not use `--no-verify` for routine work. Bypassing hooks is allowed only for
urgent production hotfixes, and the bypass must be backed by an explicit ADR or
incident record that explains why the normal gate could not run first.

Any follow-up commit after a bypass must restore the skipped evidence.
