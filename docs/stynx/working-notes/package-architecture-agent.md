# Package Architecture Agent Note

Date: 2026-04-22
Scope: define concrete workspace/package changes for an installable `stynx` package family without exposing scaffold apps as package API.

## Files inspected
- `stynx/package.json`
- `stynx/tsconfig.base.json`
- `stynx/tsconfig.json`
- `stynx/packages/README.md`
- `stynx/packages/stynx-contracts/package.json`
- `stynx/packages/stynx-contracts/tsconfig.json`
- `stynx/packages/stynx-contracts/src/index.ts`
- `stynx/packages/stynx-contracts/src/auth.ts`
- `stynx/packages/stynx-contracts/src/authorization.ts`
- `stynx/packages/stynx-contracts/src/audit.ts`
- `stynx/packages/stynx-contracts/src/storage.ts`
- `stynx/packages/stynx-contracts/src/db-context.ts`
- `stynx/packages/stynx-contracts/src/tenancy.ts`
- `stynx/packages/stynx-contracts/src/errors.ts`
- `stynx/backend/package.json`
- `stynx/backend/tsconfig.json`
- `stynx/backend/tsconfig.build.json`
- `stynx/backend/src/app.module.ts`
- `stynx/backend/src/core/core.module.ts`
- `stynx/backend/src/core/auth/auth.module.ts`
- `stynx/backend/src/core/auth/auth.service.ts`
- `stynx/backend/src/core/auth/cognito-sync.service.ts`
- `stynx/backend/src/core/storage/storage.service.ts`
- `stynx/backend/src/core/audit/audit.service.ts`
- `stynx/backend/src/shared/database/database.module.ts`
- `stynx/backend/src/shared/database/database.service.ts`
- `stynx/frontend/package.json`
- `stynx/frontend/angular.json`
- `stynx/frontend/tsconfig.json`
- `stynx/frontend/src/app/app.routes.ts`
- `stynx/frontend/src/app/app.config.ts`
- `stynx/bootstrap/package.json`
- `stynx/bootstrap/index.ts`
- `stynx/bootstrap/lib/backend.ts`
- `stynx/bootstrap/lib/frontend.ts`
- `stynx/scripts/pipeline-stub.yml`
- `stynx/scripts/backend-deploy.sh`
- `stynx/README.md`
- `stynx/docs/sys/architecture.md`
- `stynx/docs/dev/conventions.md`
- `stynx/test/backend/package.json`
- `stynx/test/backend/jest.config.ts`
- `stynx/test/db/package.json`
- `stynx/test/db/jest.config.ts`
- `stynx/test/scripts/package.json`
- `stynx/test/frontend/jest.config.cjs`
- `stynx/test/frontend/jest.config.ts`
- `stynx/test/frontend/tsconfig.jest.json`

## Current state summary
- A root workspace exists (`stynx/package.json`) but only includes `packages/*` and `apps/*`.
- Only one installable package is currently scaffolded with manifest + source: `packages/stynx-contracts`.
- Existing runnable projects (`backend`, `frontend`, `bootstrap`, `test/*`) remain outside `workspaces`, with their own package manifests and scripts.
- Bootstrap deploy code already assumes root workspace execution (`npm run build --workspace ...`) in `bootstrap/lib/backend.ts` and `bootstrap/lib/frontend.ts`, but targets `backend`/`frontend` are not workspaces in root manifest.

## Exact existing files that constrain design
- `stynx/package.json`: workspace globs are currently limited to `packages/*` and `apps/*`.
- `stynx/packages/stynx-contracts/package.json`: defines current publishable baseline (`@stech/stynx-contracts`) using CJS-style `exports` + `dist`.
- `stynx/packages/stynx-contracts/tsconfig.json`: extends `../../tsconfig.base.json`, so shared base config is already package-oriented.
- `stynx/backend/tsconfig.json`: `module: "commonjs"` and Nest aliases (`@core`, `@shared`, `@config`) indicate CJS-first backend packaging initially.
- `stynx/backend/src/core/core.module.ts`: central aggregation point for reusable modules and current best extraction seam.
- `stynx/backend/src/core/auth/auth.service.ts`: Cognito/JWKS token verification + principal mapping logic currently lives in app code.
- `stynx/backend/src/shared/database/database.service.ts`: DB session context logic (`auth.set_tenant`, `auth.set_user_context`) is a reusable platform concern.
- `stynx/backend/src/core/audit/audit.service.ts`: SQL audit sink behavior currently app-local.
- `stynx/backend/src/core/storage/storage.service.ts`: storage metadata behavior is app-local and DB-coupled.
- `stynx/bootstrap/lib/backend.ts` and `stynx/bootstrap/lib/frontend.ts`: build commands already depend on workspace semantics.
- `stynx/backend/package.json` and `stynx/frontend/package.json`: private app manifests still define primary runtime scripts used by docs/CI.
- `stynx/scripts/pipeline-stub.yml`: CI currently installs/builds per legacy directories (`backend`, `frontend`, `test/backend`, `test/frontend`).
- `stynx/test/frontend/jest.config.cjs`: hard references to `../../frontend/node_modules`, coupling test infra to legacy app folder.
- `stynx/README.md`: install/run flow is still per-folder (`cd backend`, `cd frontend`, etc.), not package-family centric.

## Target package layout (concrete)
- Keep root workspace as package-family + reference-app monorepo:
  - `packages/stynx-contracts` (existing)
  - `packages/stynx-backend` (Nest shared platform module set)
  - `packages/stynx-auth-cognito` (token verifier + principal mapping adapter)
  - `packages/stynx-storage-s3` (S3 adapter for object storage contract)
  - `packages/stynx-audit-sql` (audit sink adapter)
  - `apps/reference-backend` (non-publishable scaffold app that composes packages)
  - `apps/reference-frontend` (optional later; keep outside package API)
- Keep scaffold apps out of primary API by rule:
  - no package should re-export anything from `apps/*`
  - root should not define `exports` that expose app code

## Manifest, exports, and dependency strategy
- Naming/versioning:
  - Use scoped names for publishables: `@stech/stynx-*`.
  - Keep `apps/*` manifests `private: true`.
- Module format:
  - Start CJS-first for backend family to match `backend/tsconfig.json` (`module: commonjs`) and avoid early runtime churn.
- `exports` policy per package:
  - minimum `.` export with `types`, `require`, `default` to compiled `dist`.
  - allow explicit subpath exports only for stable public surfaces (for example `./auth`, `./audit`), not deep internals.
- Dependency boundaries:
  - `@stech/stynx-contracts`: no framework runtime deps.
  - `@stech/stynx-backend`: peer deps for Nest runtime (`@nestjs/common`, `@nestjs/core`, `@nestjs/config`, `reflect-metadata`, `rxjs`), deps on `@stech/stynx-contracts`.
  - `@stech/stynx-auth-cognito`: deps on `jose` and `@stech/stynx-contracts`; optional Nest bridge stays in `stynx-backend`.
  - `@stech/stynx-storage-s3`: deps on AWS SDK + `@stech/stynx-contracts`.
  - `@stech/stynx-audit-sql`: deps on `@stech/stynx-contracts`; keep `pg` as peer if adapter takes client/query abstraction, or direct dep if package owns connection creation.
- Internal linking:
  - use `"workspace:^"` for package-to-package dependencies during monorepo development.

## App/reference relocation plan
- Backend reference app:
  - move current Nest app composition from `backend/` to `apps/reference-backend/` in phases.
  - keep controllers/routes and app wiring in reference app; move reusable services/guards/adapters into `packages/*`.
  - first extraction candidates from current files:
    - auth verification core from `backend/src/core/auth/auth.service.ts` -> `packages/stynx-auth-cognito`
    - DB context applier from `backend/src/shared/database/database.service.ts` -> `packages/stynx-backend`
    - audit sink logic from `backend/src/core/audit/audit.service.ts` -> `packages/stynx-audit-sql`
- Frontend reference app:
  - keep current Angular app as reference scaffold (not package API); package family should not publish UI app surfaces.
- Transitional compatibility:
  - until relocation is complete, keep legacy `backend/` and `frontend/` runnable to avoid breaking existing scripts/docs.

## Safe first implementation slice
1. Create installable manifests + `src/index.ts` entrypoints for empty package dirs already present:
   - `packages/stynx-backend`
   - `packages/stynx-auth-cognito`
   - `packages/stynx-storage-s3`
   - `packages/stynx-audit-sql`
2. Keep implementations minimal and compile-only:
   - export interfaces/factories and thin adapters only; no behavior changes to current `backend/` app.
3. Add `apps/reference-backend/package.json` as `private: true` and wire it to consume `@stech/stynx-contracts` first.
4. Update root workspace commands only after package manifests exist, then validate with workspace-wide `build`/`typecheck`.
5. Defer controller/route moves, CI workflow rewrites, and frontend relocation to subsequent slices.

## Notes on risk and sequencing
- Highest immediate risk is workspace-command mismatch between root/workspace config and bootstrap build calls (`bootstrap/lib/backend.ts`, `bootstrap/lib/frontend.ts`).
- Second risk is test tooling coupling to `frontend/node_modules` (`test/frontend/jest.config.cjs`), which should be normalized only after app relocation paths stabilize.
- Lowest-risk path is to land package manifests + public entrypoints first, then incrementally move reusable logic from app code.
