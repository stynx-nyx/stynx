# STYNX

STYNX is a `pnpm` + `Turborepo` monorepo targeting GitHub Packages for the spec-defined `@stynx/*` and `@stynx-web/*` package families.

`1.0.0` release preparation is implemented in-repo and the tracked release-readiness gates are closed. STYNX is not marked as shipped until an explicit versioning and publishing decision is made.

## Monorepo Layout

```text
stynx/
├── packages/                       # Backend (Node/NestJS)
│   ├── core/
│   ├── auth/
│   ├── tenancy/
│   ├── data/
│   ├── storage/
│   ├── audit/
│   ├── logging/
│   ├── health/
│   ├── sessions/
│   ├── ratelimit/
│   ├── idempotency/
│   ├── privacy/
│   ├── i18n/
│   ├── testing/
│   ├── contracts/
│   └── cli/
├── packages-web/                   # Frontend (Angular / TS)
│   ├── sdk/
│   ├── angular/
│   ├── angular-auth/
│   ├── angular-tenancy/
│   ├── angular-storage/
│   ├── angular-sessions/
│   ├── angular-profile/
│   ├── angular-trash/
│   ├── angular-i18n/
│   └── angular-ui/
├── apps/
│   ├── reference-api/
│   └── reference-web/
├── tools/
│   ├── eslint-config/
│   ├── tsconfig/
│   └── migration-linter/
├── test/
│   └── perf/k6/                    # k6 scenarios, baselines, generated summaries
├── docs/
├── specs/                          # Normative root specs
├── porting-pack/                   # Standalone adoption pack; kept root to preserve copy/paste paths
├── config/                         # Tool config bodies used by explicit CLI flags
├── .changeset/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Transitional Legacy Directories

The repository still contains legacy runtime and test directories during the extraction:

- `backend/`
- `frontend/`
- `bootstrap/`
- `test/`

They are intentionally preserved for migration work, but they are outside the Prompt 1 workspace graph.

The porting pack intentionally remains at `porting-pack/` instead of moving under `docs/`: its generated prompts and consumer-facing agent context refer to `./porting-pack/` as a drop-in bundle path.

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
