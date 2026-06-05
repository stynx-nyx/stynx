# `@stynx/testing` — testcontainers-backed integration harness for STYNX apps

`@stynx/testing` is the integration-test substrate for STYNX-based apps. It provides `createTestApp()` — a one-call factory that boots an isolated NestJS app backed by **real Docker containers** (Postgres via testcontainers, plus optional LocalStack for S3/SQS and a Cognito stub) wired to your modules. The returned `TestAppContext` exposes the NestJS app instance, a request-context mutator (so tests can assert behaviour under a specific tenant/actor), session helpers (`mintTestSession` produces a valid JWT against the test signing key), LGPD fixtures (PII-column seed data + erasure scenarios), and a family of archive-aware matchers that understand soft-delete + restore semantics.

## Purpose

Integration tests against a real DB catch the bugs unit tests with mocked repos miss: row-level security policies, soft-delete cascades, RLS interaction with the request context, idempotency replay semantics, audit-event emission. `@stynx/testing` removes the boilerplate: instead of every test file orchestrating its own Postgres container, schema migration, and request-context wiring, you call `createTestApp()` and get a working environment in one line. The fixtures + matchers then encode STYNX's idioms (archive-aware queries, soft-delete cascades, PII handling) so your test assertions stay readable.

You reach for `@stynx/testing` when you are writing integration tests for a STYNX-based app — typically under `test/integration/` or `*.int.spec.ts` files run by Vitest. Unit tests with mocked services don't need it; integration tests against real Postgres + S3 do.

What it does NOT do: it does not replace Vitest/Jest. It's a runtime harness used INSIDE your tests. It does not run schema migrations automatically — your `CreateTestAppOptions` declares which migration step set or `TestSqlStep[]` array to run.

## Audience

NestJS backend developers writing integration tests. Typical scenario: you have a `packages/<my-feature>/test/integration/*.int.spec.ts` file, and you want a real `TenantContext`, a real DB, a real session JWT, and assertions that understand archive-aware soft-delete semantics. Docker must be running locally; in CI, the testcontainers backend auto-detects the runtime.

## Install

```bash
pnpm add -D @stynx/testing
```

**Peer dependencies:** `@nestjs/testing` `^11`, `@stynx/core` `^1`, `@stynx/data` `^1`, `testcontainers` `^10`, `vitest` `^2` or `jest` `^29`. **Docker required at runtime** (see R15 pilot retro for the precedent).

**Node:** 24.x.

## Quick start

```ts
// test/integration/users.int.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, type TestAppContext } from '@stynx/testing';
import { UsersModule } from '../../src/users.module';

describe('UsersService (integration)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp({
      modules: [UsersModule],
      sql: [
        /* schema SQL or migration runner */
      ],
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a user under a tenant', async () => {
    await ctx.withRequest({ tenantId: 'tenant-a', actorId: 'admin-1' }, async () => {
      const service = ctx.app.get(UsersService);
      const user = await service.create({ email: 'a@b.com' });
      expect(user.tenantId).toBe('tenant-a');
    });
  });
});
```

## Public API surface

### Functions

| Export            | Signature                                                       | Description                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTestApp`   | `(options: CreateTestAppOptions): Promise<TestAppContext>`      | Boots an isolated NestJS app with optional Postgres / LocalStack / Cognito containers. The returned context exposes `.app`, `.withRequest()`, `.db`, `.close()`. |
| `mintTestSession` | `(input: { actorId, tenantId?, roles?, permissions? }): string` | Produces a JWT signed with the test signing key. Use to test endpoints that require a `Bearer <token>` header.                                                   |
| `runDoctor`       | `(repoRoot: string): Promise<DoctorReport>`                     | Run the doctor harness check (mirrors sibling DEVAI doctor); useful in workspace tests.                                                                          |
| `lgpdFixtures`    | `LgpdFixtures`                                                  | Pre-built PII fixture set: users with email + phone columns marked, erasure scenarios.                                                                           |

### Matchers

| Export              | Description                                                                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `archiveAwareEqual` | Vitest matcher: compares an entity ignoring soft-delete metadata (`archivedAt`, `archivedBy`). Useful for asserting "the record exists and matches, regardless of archive state". |
| `softDeleteBlocked` | Asserts a soft-delete-blocked operation throws the expected error.                                                                                                                |
| `restoreConflict`   | Asserts a restore attempt collides with a parent-archived record.                                                                                                                 |

### Types / Interfaces

| Export                                                                                              | Description                                                                                                   |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `CreateTestAppOptions`                                                                              | `{ modules, sql?, providers?, postgres?, localstack?, cognito?, requestContext? }`.                           |
| `TestAppContext`                                                                                    | `{ app, db, withRequest, close, signSession, localstack?, cognito? }`.                                        |
| `TestSqlStep`                                                                                       | `string \| ((client: StynxPgClient) => Promise<void>)`. Each step is either raw SQL or an arbitrary function. |
| `StartedPostgresHandle` / `StartedRedisHandle` / `StartedLocalstackHandle` / `StartedCognitoHandle` | Per-container started-handle types.                                                                           |

## Configuration

### `CreateTestAppOptions`

| Option           | Type                  | Default                           | Description                                                                        |
| ---------------- | --------------------- | --------------------------------- | ---------------------------------------------------------------------------------- |
| `modules`        | `Type<unknown>[]`     | (required)                        | NestJS modules to import.                                                          |
| `providers`      | `Provider[]`          | `[]`                              | Additional providers (override services, etc.).                                    |
| `sql`            | `TestSqlStep[]`       | `[]`                              | SQL or migration runners executed against the test Postgres after container start. |
| `postgres`       | `PostgresOptions`     | enabled with `postgres:16-alpine` | Postgres container config.                                                         |
| `localstack`     | `LocalstackOptions`   | disabled                          | Enable S3 + SQS containers.                                                        |
| `cognito`        | `CognitoOptions`      | disabled                          | Enable Cognito stub.                                                               |
| `requestContext` | `RequestContextPatch` | empty                             | Default request frame for all tests in this app.                                   |

### Environment variables

| Variable                      | Default                      | Description                                               |
| ----------------------------- | ---------------------------- | --------------------------------------------------------- |
| `STYNX_TEST_PG_HOST`          | (unset; testcontainers auto) | Override host if running Postgres outside testcontainers. |
| `TESTCONTAINERS_REUSE_ENABLE` | `true`                       | Reuse containers across test runs for speed.              |

## Examples

### Example 1 — running SQL fixture before tests

```ts
ctx = await createTestApp({
  modules: [UsersModule],
  sql: [
    'CREATE TABLE users (...);',
    async (client) => {
      await client.query('INSERT INTO users (id, email) VALUES ($1, $2)', ['u1', 'seed@b.com']);
    },
  ],
});
```

### Example 2 — testing with a mint'ed session

```ts
const token = mintTestSession({ actorId: 'u1', tenantId: 't1', roles: ['admin'] });
const res = await request(ctx.app.getHttpServer())
  .get('/users')
  .set('Authorization', `Bearer ${token}`);
expect(res.status).toBe(200);
```

### Example 3 — archive-aware assertion

```ts
import { archiveAwareEqual } from '@stynx/testing';

const user = await usersRepo.findById('u1');
expect(user).toEqual(archiveAwareEqual({ id: 'u1', email: 'seed@b.com' }));
// passes whether user is active OR soft-deleted
```

## Common pitfalls

- **Docker not running** — testcontainers throws "Could not find a working container runtime strategy". This is the pre-existing R15 finding; not specific to `@stynx/testing`. Ensure Docker Desktop / Colima is up before running integration tests.
- **Forgetting `ctx.close()`** — leaks containers across test files. Use `afterAll` to call it; testcontainers' reuse mode mitigates but doesn't eliminate the leak.
- **Schema migration ordering** — `sql` runs in order, but if your schema depends on extensions (e.g. `pgcrypto`), include `CREATE EXTENSION` first.
- **Running `withRequest()` outside an `await`** — the request frame is async-local; calls outside the callback don't see the frame.

## Related packages

- [`@stynx/core`](/docs/packages/core/) — provides `RequestContext`; `withRequest()` mutates this for tests.
- [`@stynx/data`](/docs/packages/data/) — provides `StynxDataModule` + the `StynxPgClient` `withRequest()` exposes via `.db`.
- [`@stynx/auth`](/docs/packages/auth/) — `mintTestSession` produces tokens that pass `@stynx/auth`'s verifier under the test signing key.
- [`@stynx/pdf`](/docs/packages/pdf/) — provides `createFixturePdfBackend()` for tests that don't want to invoke real Chromium.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-testing/`](/docs/api-reference/stynx-testing/)
