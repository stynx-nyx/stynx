# Reference API

`@stynx/reference-api` is the runnable NestJS reference app for the neutral `sample.*` domain defined in [STYNX-REFERENCE-MIGRATION.sql](../../specs/STYNX-REFERENCE-MIGRATION.sql).

## What It Exercises

- `@stynx/data` for archive-aware CRUD and soft-delete/restore/hard-delete flows
- `@stynx/auth` and `@stynx/tenancy` for request/tenant enforcement
- `@stynx/ratelimit` and `@stynx/idempotency` through route decorators + pipeline wiring
- `@stynx/storage`, `@stynx/audit`, `@stynx/health`, and `@stynx/logging`

## Local Run

```bash
pnpm --filter @stynx/reference-api build
pnpm --filter @stynx/reference-api start
```

Default runtime environment variables:

- `STYNX_OWNER_DATABASE_URL`
- `STYNX_APP_DATABASE_URL`
- `STYNX_READER_DATABASE_URL`
- `STYNX_STYNX_ISSUER`
- `STYNX_COGNITO_ISSUER`
- `STYNX_REDIS_URL`
- `STYNX_STORAGE_REGION`
- `STYNX_STORAGE_BUCKET`

If the three database URLs are absent, they fall back to `postgresql://postgres:postgres@localhost:5432/postgres`.
If `STYNX_REDIS_URL` is absent, it falls back to `redis://127.0.0.1:6379`.

The root `pnpm smoke:local` command runs this app through `docker compose`. Its
host-side migration connection defaults to PostgreSQL port `55432` through
`STYNX_SMOKE_POSTGRES_PORT`, so it can coexist with a developer PostgreSQL on
`5432`. The API container still connects to `postgres:5432` inside the compose
network. The compose API service sets `NODE_ENV=development` and
`STYNX_ENVIRONMENT=local` so the reference-only `/_reference/dev-login` helper is
available to local smoke and k6 runs; the Docker image itself keeps
`NODE_ENV=production` by default.

## Tests

```bash
pnpm --filter @stynx/reference-api test
pnpm --filter @stynx/reference-api typecheck
pnpm --filter @stynx/reference-api lint
```

## Common Operations

- Create a record: `POST /records`
- Create a note: `POST /record-notes`
- Create a work item: `POST /work-items`
- Create an entry: `POST /work-item-entries`
- Create a blocking lock: `POST /work-item-locks`
- Start a document upload: `POST /documents`
- Complete document ingestion: `POST /documents/:id/complete`
- Download document: `GET /documents/:id/download`
- Soft-delete a record: `DELETE /records/:id`
- Browse archived records: `GET /records/trash`
- Restore from archive: `POST /records/:id/restore`
- Irreversible archive delete: `DELETE /records/:id/hard`

The app-local migration under `migrations/0001_reference.sql` is a copy of the reference migration spec and is executed after STYNX platform migrations on startup.
