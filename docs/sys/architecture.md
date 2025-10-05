# System Architecture

st-core provides a canonical multi-tenant architecture synthesised from PORM (canonical) and PEC (complementary) code bases.

## High-Level Components
- **API (NestJS)** – Modular `CoreModule` exposing authentication, tenancy, auditing, storage, docs, logging, and health endpoints. Shared `DatabaseService` applies tenant/user context before executing SQL.
- **Frontend (Angular)** – Shell application with Cognito integration, admin consoles, storage tooling, and shared UI components. Auth state flows through the `AuthFacade` and HTTP interceptor.
- **Database (PostgreSQL)** – `auth`, `audit`, and `storage` schemas with deterministic seeds. Row-Level Security policies leverage helper functions (`auth.set_tenant`, `auth.set_user_context`) and match PEC's enforcement strategy.
- **Automation Scripts** – Provisioning for Cognito, S3, EC2, CloudFront, and PostgreSQL, plus CI/CD stubs ready for GitHub Actions.

## Request Lifecycle
1. **HTTP Entry** – Requests enter via Express with `LoggingModule` interceptors attaching correlation IDs and structured access logs (PEC pattern).
2. **Authentication** – `JwtAuthGuard` verifies Cognito tokens using JWKS, merges roles, and resolves tenancy from token or headers (PORM logic extended with PEC tenancy hints).
3. **Authorisation** – Guards (`UserGuard`, `RoleGuard`, `TenancyGuard`) enforce access; metadata-driven `AuditInterceptor` persists write traces via `audit.events`.
4. **Database Access** – Services consume `DatabaseService`, which sets session variables (`auth.set_tenant`, `auth.set_user_context`) before running queries. Policies defined in SQL guarantee RLS regardless of application logic.
5. **Response** – Interceptors add correlation IDs to responses. Frontend consumes JSON APIs via `ApiService`, keeping tokens in sync through `AuthFacade` and the Cognito stub.

## Deployment Flow
1. **Bootstrap Cloud Resources** – Run scripts under `scripts/` to provision Cognito, S3, EC2, and CloudFront.
2. **Configure Environment** – Populate `.env` for backend (`DATABASE_URL`, `COGNITO_*`, `S3_*`), update Angular environment files, and sync secrets to CI.
3. **Database Migration** – Apply `db/ddl/*` in order, then seeds. Use `scripts/db-reset.sh` for idempotent local rebuilds.
4. **Build & Ship** – Backend build/test via `backend/package.json` scripts, frontend via Angular CLI, deployment orchestrated through `scripts/backend-deploy.sh` and CI pipeline stub.

Refer to `docs/dev/conventions.md` for coding standards and `docs/api/README.md` for API export instructions.
