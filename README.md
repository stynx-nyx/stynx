# STYNX

> **C-4 done** — stynx is a [DEVAI](https://github.com/anthropics/devai)-managed adopter at maturity. See [docs/pilots/c-4/phase-i-retro.md](docs/pilots/c-4/phase-i-retro.md) for the full pilot retro (Phases A–I + R1, S1–S11, T1–T8).

STYNX is a `pnpm` + `Turborepo` monorepo targeting GitHub Packages for the spec-defined `@stynx/*` and `@stynx-web/*` package families.

`1.0.0` release preparation is implemented in-repo and the tracked release-readiness gates are closed. STYNX is not marked as shipped until an explicit versioning and publishing decision is made.

## Active workspace shape (post-C-4 adoption pilot)

| Tree                                                           | Purpose                                                                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/*`                                                   | Backend reusable libraries (`@stynx/*`)                                                                                                              |
| `packages-web/*`                                               | Frontend reusable libraries (`@stynx-web/*`)                                                                                                         |
| `reference/{api,web}/`                                         | Reference applications demonstrating framework usage (analogous to DEVAI's `examples/`). Relocated here from `apps/reference-*` in Session S2 (C-4). |
| `domain/<module>/`                                             | DEVAI-scaffolded modules. First example: `domain/demo-bookmark/` (C-4 Phase D).                                                                      |
| `tools/*`                                                      | Internal repo tooling (`@stynx-internal/*`).                                                                                                         |
| `infra/cdk/`                                                   | AWS CDK infrastructure. Out of DEVAI's purview (stynx-specific).                                                                                     |
| `test/`                                                        | Centralized test harness (backend, frontend, perf, scripts).                                                                                         |
| `database/{ddl,seed,migrations}/`                              | Canonical SQL bootstrap, seed, and migration support files.                                                                                          |
| `.devai/`                                                      | DEVAI substrate (config + state + evidence chain + constitution pointer). Auto-generated; do not hand-edit.                                          |
| `docs/{product,arch,contracts,adr,ops,gov,security,glossary}/` | DEVAI-shaped Article 6 F1 substrate roots; `docs/gov/` delegates substantive governance to sibling DEVAI.                                            |
| `docs/{stynx,dev,api}/`                                        | Stynx-specific documentation.                                                                                                                        |
| `docs/legacy/`                                                 | Pre-pilot governance + completed GAP tasks, archived for archeology. NOT authoritative for current state.                                            |
| `tools/npm-security-upgrade-auditor/`                          | Stynx-idiosyncratic dep-security skill. Was `.codex/skills/npm-security-upgrade-auditor/`; relocated in C-4 Session T7 when `.codex/` was retired.   |

Pre-extraction `backend/`, `frontend/`, `bootstrap/` trees were removed prior to the C-4 pilot close; root `test/` remains as the centralized test harness (active workspace member).

The porting pack is docs-native at `docs/stynx/porting-pack/`. It is adoption guidance and historical generation context, not a root drop-in bundle.

## Workspace Commands

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

## Publishing

- Package manager: `pnpm@9`
- Task runner: `turbo`
- Release manager: `changesets`
- Registries: GitHub Packages for the current `@stech/*` packages and the future `@stynx/*` / `@stynx-web/*` scopes

## CI and Release

- STYNX framework CI entrypoints:
  - `pnpm ci:stynx`
  - `pnpm lint:stynx`
  - `pnpm typecheck:stynx`
  - `pnpm test:stynx`
  - `pnpm test:int:stynx`
  - `pnpm build:stynx`
- Reference app consumer entrypoint:
  - `pnpm ci:reference-apps`
- Local GitHub-compatible evidence entrypoints:
  - `pnpm ci:local:stynx`
  - `pnpm ci:local:stynx-release`
  - `pnpm ci:local:reference-apps`
- Release entrypoints:
  - `pnpm ci:stynx:release`
  - `pnpm release:policy`
  - `pnpm release:status`
  - `pnpm release:drafts`
  - `pnpm version-packages`
  - `pnpm release`
- `.npmrc` maps the STYNX package scopes to GitHub Packages; release publishing still gets auth from the workflow `NODE_AUTH_TOKEN`.
- In GitHub Actions release publishing, map `NODE_AUTH_TOKEN` to a token with package publish rights.
