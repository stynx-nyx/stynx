# System Architecture

stynx provides a canonical multi-tenant architecture synthesised from PORM (canonical) and PEC (complementary) code bases.

## High-Level Components

- **API (NestJS)** – Modular `CoreModule` exposing authentication, tenancy, auditing, storage, docs, logging, and health endpoints. Shared `DatabaseService` applies tenant/user context before executing SQL.
- **Frontend (Angular)** – Shell application with Cognito integration, admin consoles, storage tooling, and shared UI components. Auth state flows through the `AuthFacade` and HTTP interceptor.
- **Database (PostgreSQL)** – `auth`, `audit`, and `storage` schemas with deterministic seeds. Row-Level Security policies leverage helper functions (`auth.set_tenant`, `auth.set_user_context`) and match PEC's enforcement strategy.
- **Automation** – GitHub Actions and local CI preflight commands run the
  platform, reference-app, docs, hardening, and release gates. Runtime
  infrastructure is modeled in `infra/cdk`; ad hoc deployment/bootstrap shell
  stubs are intentionally not part of the current platform surface.

## Request Lifecycle

1. **HTTP Entry** – Requests enter via Express with `LoggingModule` interceptors attaching correlation IDs and structured access logs (PEC pattern).
2. **Authentication** – `JwtAuthGuard` verifies Cognito tokens using JWKS, merges roles, and resolves tenancy from token or headers (PORM logic extended with PEC tenancy hints).
3. **Authorisation** – Guards (`UserGuard`, `RoleGuard`, `TenancyGuard`) enforce access; metadata-driven `AuditInterceptor` persists write traces via `audit.events`.
4. **Database Access** – Services consume `DatabaseService`, which sets session variables (`auth.set_tenant`, `auth.set_user_context`) before running queries. Policies defined in SQL guarantee RLS regardless of application logic.
5. **Response** – Interceptors add correlation IDs to responses. Frontend consumes JSON APIs via `ApiService`, keeping tokens in sync through `AuthFacade` and the Cognito stub.

## Delivery Flow

1. **Platform gates** – Run `pnpm lint`, `pnpm typecheck`, `pnpm test`,
   `pnpm test:int`, `pnpm build`, and `pnpm run doctor` from the repository root.
   These commands target STYNX platform packages, tools, docs, and test
   harnesses, not reference-app ownership lanes.
2. **Reference-app gates** – Run reference app build/test/E2E/container checks
   through `reference-apps.yml` or `pnpm run ci:local -- reference-apps`.
3. **Database verification** – Apply package migrations, then use
   `pnpm db:verify`, `scripts/db-reset.sh`, and `pnpm check:rls-smoke` for
   platform database checks.
4. **Release** – Changesets owns package versioning and publishing. GitHub
   Actions owns release evidence and deployment handoff.

Refer to `docs/dev/conventions.md` for coding standards and `docs/api/README.md` for API export instructions.
