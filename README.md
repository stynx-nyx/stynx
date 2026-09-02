# STYNX

STYNX is a `pnpm` and Turborepo monorepo for reusable NestJS and Angular
packages published under the `@stynx-nyx/*` scope.

STYNX 1.1.1 is published as a unified 44-package line on GitHub Packages. The
1.1.2 campaign is closing release-lane and assessment findings so future releases
complete through automation without manual package publication or tag pushes.

## Workspace shape

| Tree                                  | Purpose                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------ |
| `packages/*`                          | Backend reusable libraries                                               |
| `packages-web/*`                      | Angular reusable libraries                                               |
| `reference/{api,web}/`                | Reference applications demonstrating framework usage                     |
| `domain/<module>/`                    | Product modules with API, web, database, and docs surfaces               |
| `tools/*`                             | Internal repository tooling                                              |
| `infra/cdk/`                          | AWS CDK infrastructure                                                   |
| `test/`                               | Central test harness                                                     |
| `database/{ddl,seed,migrations}/`     | Canonical SQL bootstrap, seed, and migration support                     |
| `docs/`                               | Architecture, contracts, operations, security, and product documentation |
| `tools/npm-security-upgrade-auditor/` | Repository-specific dependency security audit procedure                  |

The engineering rules and ownership boundaries for these paths are documented
in [docs/meta/development-contract.md](docs/meta/development-contract.md).

## Workspace commands

```bash
corepack pnpm install
corepack pnpm build
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:int
corepack pnpm test:e2e
corepack pnpm changeset
```

## CI and release

- `pnpm ci:stynx` runs the primary framework checks.
- The required DEVAI local-RC lane is the canonical full release-candidate graph;
  it includes the governed lint families, end-to-end, mutation, performance, and
  RLS checks.
- `pnpm ci:stynx:remote-full` provides the remote non-mutation full lane.
- `pnpm ci:reference-apps` verifies the reference consumers.
- `pnpm ci:stynx:release` verifies the release policy, provenance, fixtures, and drafts.
- `pnpm release:status`, `pnpm release:drafts`, `pnpm version-packages`, and
  `pnpm release` provide the changesets release flow.

`.npmrc` maps the STYNX package scope to GitHub Packages. CI and release jobs
receive registry credentials through `NODE_AUTH_TOKEN`.
