# Contributing

STYNX uses Conventional Commit subjects for local commits and pull request
titles, for example `fix(repo): close migration gate`.

Run the normal hooks and CI gates before asking for review:

```bash
pnpm lint
pnpm typecheck
pnpm -r --if-present test --silent
```

The authoritative parser is `tools/repo-config/commitlint.config.cjs`; the PR
title workflow pipes the title through that same config.

## Hook Policy

Do not use `--no-verify` for routine work. Bypassing hooks is allowed only for
urgent production hotfixes, and the bypass must be backed by an explicit ADR or
incident record that explains why the normal gate could not run first.

Any follow-up commit after a bypass must restore the skipped evidence.

## Adoption notes contract for package-changing rounds

When a STYNX round changes a public `packages/*` or `packages-web/*` surface,
the closeout must include adopter notes with these fields:

- Exact package version or local workspace state.
- Public export names added, changed, or deprecated.
- Migration notes for adopter import sites, with path patterns where known.
- Fixture compatibility notes, including byte-stable or golden-equivalent
  expectations.
- Commands the closeout ran, such as `pnpm --filter <pkg> build test lint`.
- Explicit product or architecture decisions that intentionally keep behavior
  outside STYNX, with rationale and adopter impact.

Use this shape in the closeout:

```md
## STYNX R<N> closeout — adopter notes

- Package: `@stynx-nyx/<name>` v<X.Y.Z>
- Surface changes: [...]
- Migration: [...]
- Fixture compat: [...]
- Commands: [...]
- Product or architecture decisions: [...]
```
