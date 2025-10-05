# st-core

st-core is the shared bootstrap platform for future NestJS + Angular applications. It merges the architecture, naming conventions, and operational practices established in the PORM and PEC systems into a single, reusable foundation covering authentication, tenancy, auditing, storage, and developer tooling.

## Repository Layout

- `backend/` – NestJS API skeleton with modular core (auth, audit, tenancy, storage, docs, logging, health) and shared database client.
- `frontend/` – Angular 20 base shell, Cognito-aware auth flow, admin consoles, storage UI, and shared UI widgets built with the new control-flow syntax and the `inject()` API.
- `db/` – SQL-first schema definitions and seeds (auth/audit/storage) plus DDL smoke tests under `test/db`.
- `scripts/` – Host-executable automation for provisioning AWS resources, database workflows, documentation export, and CI/CD scaffolding.
- `docs/` – Living documentation split into system context (`docs/sys`), developer conventions (`docs/dev`), and generated API materials (`docs/api`).
- `test/` – Centralised Jest/Cypress suites for database, backend, frontend, and script validation.

## Getting Started

1. **Dependencies**
   - Node.js 20+
   - PostgreSQL 14+
   - AWS CLI v2 for deployment scripts

2. **Environment variables**
   - Copy `backend/.env.example` to `backend/.env` and fill in the required values (Cognito, S3, SMTP, etc.).
   - The Angular frontend reads environment settings from `frontend/src/environments/*`.

3. **Install toolchains**
   ```bash
   (cd backend && npm install)
   (cd frontend && npm install)
   (cd test/backend && npm install)
   (cd test/frontend && npm install)
   (cd test/db && npm install)
   (cd test/scripts && npm install)
   ```

4. **Database setup**
   ```bash
   scripts/postgres-setup.sh --database-url postgres://user:pass@localhost:5432/st_core
   psql "$DATABASE_URL" -f db/ddl/00-extensions.sql
   psql "$DATABASE_URL" -f db/ddl/01-auth.sql
   psql "$DATABASE_URL" -f db/ddl/02-audit.sql
   psql "$DATABASE_URL" -f db/ddl/03-storage.sql
   psql "$DATABASE_URL" -f db/seed/00-base.sql
   ```

5. **Run backend**
   ```bash
   (cd backend && npm run start:dev)
   ```

6. **Run frontend**
   ```bash
   (cd frontend && npm start)
   ```

7. **Run tests & lint**
   ```bash
   (cd frontend && npm run lint)
   (cd frontend && npm run test)
   (cd frontend && npm run build)
   (cd backend && npm test)
   (cd test/db && npm test)
   (cd test/scripts && npm run test)
   ```

## Documentation & Diagrams

- `docs/sys/architecture.md` – lifecycle, deployment flows, and system context diagrams.
- `docs/dev/conventions.md` – coding standards, naming rules, linting, and testing strategies.
- `docs/dev/frontend.md` – Angular modernization patterns (external templates/styles, control flow directives, `inject()` usage, admin consoles).
- `docs/api/README.md` – instructions for exporting Swagger/OpenAPI artefacts via `npm run swagger:export`.

## Modern Frontend Highlights

- Inline templates and styles have been externalised to `.html` / `.scss` files for easier maintenance.
- Structural directives now rely on Angular’s `@if` / `@for` syntax.
- Components and services adopt the `inject()` API instead of constructor DI.
- The admin area bundles user management with role and tenancy tooling, mirroring the PORM experience while calling stubbed backend endpoints.

## Next Steps

- Tune Cognito configuration in `backend/.env` and Angular environments before deploying.
- Extend admin and storage modules with domain-specific functionality.
- Wire the deployment scripts into your CI/CD toolchain (see `scripts/pipeline-stub.yml`).
