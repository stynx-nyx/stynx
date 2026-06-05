# `@stynx/core` — request context, configuration, errors, and secrets

`@stynx/core` is the NestJS foundation every other `@stynx/*` package depends on. It owns four cross-cutting concerns: per-request context (request id, tenant id, actor id, session id, locale — accessible from any service via dependency injection), schema-validated configuration loading (Zod-driven, with optional AWS SSM hydration), the canonical error envelope shape (`StynxError` + `StynxErrorFilter`), and secret loading (AWS Secrets Manager with caching). Wire it once at the root of your app; every downstream `@stynx/*` package reads from these primitives.

## Purpose

`@stynx/core` solves the _foundation_ problem in a multi-tenant NestJS app: every request needs a stable identifier, knowledge of the actor + tenant + session it runs under, a single canonical error shape that bubbles up consistently, schema-validated environment configuration, and a secret loader that doesn't leak credentials into logs. Each of these is solvable separately, but composing them ad-hoc across packages creates drift. `@stynx/core` resolves it once.

You reach for `@stynx/core` when you are starting a new STYNX-based backend app, or when you are integrating an existing app onto STYNX and need the request-context substrate for tenant scoping, audit, idempotency, or rate-limit decisions downstream. It is **always the first** `@stynx/*` package wired in your `AppModule`.

What it does NOT do: it does not own tenant data (that's [`@stynx/tenancy`](/docs/packages/tenancy/)), does not enforce authentication (that's [`@stynx/auth`](/docs/packages/auth/)), does not persist anything (that's [`@stynx/data`](/docs/packages/data/)). It provides the _contexts and primitives_ those packages consume.

## Audience

NestJS backend developers building a STYNX-based application. You inject `RequestContext` into your services to read tenant/actor, throw `StynxError` subclasses to participate in the unified error envelope, register your env-var schema with `StynxCoreModule.forRoot()` to get type-safe configuration, and use `SecretLoader` to pull secrets without ever logging them. Typical integration scenario: a new NestJS service starting from `@nestjs/cli` adopts `@stynx/core` first, then layers `@stynx/auth`, `@stynx/tenancy`, and `@stynx/data` on top.

## Install

```bash
pnpm add @stynx/core
```

**Peer dependencies:** `@nestjs/common` `^11`, `@nestjs/core` `^11`, `nestjs-cls` `^4`, `zod` `^3`. `@aws-sdk/client-ssm` and `@aws-sdk/client-secrets-manager` are required at runtime only when you enable SSM hydration or call `SecretLoader.load()`.

**Node:** 24.x. **pnpm:** 9.x.

## Quick start

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx/core';
import { z } from 'zod';

const ConfigSchema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

@Module({
  imports: [
    StynxCoreModule.forRoot({
      appName: 'my-stynx-app',
      schema: ConfigSchema,
      defaults: { PORT: 3000 },
    }),
  ],
})
export class AppModule {}
```

```ts
// src/users/users.service.ts
import { Injectable } from '@nestjs/common';
import { RequestContext, StynxConfigService } from '@stynx/core';

@Injectable()
export class UsersService {
  constructor(
    private readonly ctx: RequestContext,
    private readonly config: StynxConfigService,
  ) {}

  async listUsers() {
    // Logged on every call with the request id + tenant id Nest auto-populates
    console.log(`request=${this.ctx.requestId} tenant=${this.ctx.tenantId}`);
    const dbUrl = this.config.get('DATABASE_URL');
    // ... your logic
  }
}
```

That's the minimum. `StynxCoreModule` registers the request-context interceptor + the canonical error filter globally, so every controller method gets a request frame, and every thrown `StynxError` becomes a structured response.

## Public API surface

### Modules

| Export                         | Signature                                       | Description                                                                                                                                                                                                                                   |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StynxCoreModule`              | `.forRoot<TSchema extends ZodTypeAny>(options)` | The root module. Registers the request-context interceptor + error filter as `APP_*` providers; exposes config + secret services. Global; import once in `AppModule`. See [TypeDoc](/docs/api-reference/stynx-core/classes/StynxCoreModule/). |
| `StynxCoreModule.forRootAsync` | `.forRootAsync(options)`                        | Async variant for when options come from another DI provider.                                                                                                                                                                                 |

### Services / Injectables

| Export                  | Description                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RequestContext`        | Read-only view of the current request frame: `requestId`, `tenantId`, `actorId`, `sessionId`, `locale`, `startedAt`. Injectable in any service; throws `RequestContextMissingError` if read outside an active request frame.                                      |
| `RequestContextMutator` | Write surface for the request frame. Allows interceptors / guards (e.g. `@stynx/auth`'s `AuthContextGuard`) to populate `tenantId`, `actorId`, `sessionId`, `locale` once at the request boundary. Mutations outside a frame throw `RequestContextMutationError`. |
| `StynxConfigService`    | Schema-validated config reader. `.get(key)` returns the typed value the Zod schema declared. Configuration is loaded once at bootstrap from `process.env` + optional SSM hydration + `options.defaults`.                                                          |
| `SecretLoader`          | AWS Secrets Manager wrapper with TTL cache + connection-error retry. `.load(secretId)` returns the secret value or throws `SecretLoadError`.                                                                                                                      |
| `SystemContext`         | Marks an operation as "system-initiated" (no actor) for audit purposes. Required for cron jobs, migrations, system-fired effects. Throws `SystemContextRequiredError` if downstream operations require it and it isn't active.                                    |

### Classes

| Export                      | Description                                                                                                                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StynxErrorFilter`          | Global `ExceptionFilter` registered automatically. Transforms thrown `StynxError` subclasses into the canonical error envelope; non-Stynx errors are wrapped with a generic 500 envelope. |
| `RequestContextInterceptor` | Global `NestInterceptor` registered automatically. Wraps every request in a CLS frame with a freshly generated `requestId`.                                                               |

### Errors (all extend `StynxError`)

| Export                          | HTTP status | Code                                 | Thrown when                                                                                                               |
| ------------------------------- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `StynxError`                    | (varies)    | (caller)                             | Base class for all package-specific errors. Carries `code`, `status`, optional `context`, optional `cause`, `messageKey`. |
| `RequestContextMissingError`    | 500         | `REQUEST_CONTEXT_MISSING`            | Code reads `RequestContext` outside an active request frame.                                                              |
| `RequestContextMutationError`   | 500         | `REQUEST_CONTEXT_MUTATION_FORBIDDEN` | Code mutates `RequestContextMutator` outside an active frame.                                                             |
| `ConfigurationValidationError`  | 500         | `CONFIGURATION_VALIDATION_ERROR`     | Zod schema validation fails at bootstrap.                                                                                 |
| `ConfigOwnershipViolationError` | 500         | `CONFIG_OWNERSHIP_VIOLATION`         | A package reads a config key it does not own (per `configMetadata`).                                                      |
| `SystemContextRequiredError`    | 500         | `SYSTEM_CONTEXT_REQUIRED`            | A downstream operation requires `SystemContext` but it isn't active.                                                      |
| `SecretLoadError`               | 500         | `SECRET_LOAD_ERROR`                  | `SecretLoader.load()` fails (auth, network, missing secret).                                                              |

### Functions

| Export                   | Signature                                               | Description                                                                                                               |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `getRequestId`           | `(req: Request \| FastifyRequest): string \| undefined` | Standalone helper to read the request id from a raw HTTP request (use in HTTP middleware, before NestJS DI is available). |
| `generateRequestId`      | `(): string`                                            | Generate a new request id. Used internally by the interceptor; exposed for tests.                                         |
| `loadStynxConfiguration` | `(options): Promise<TConfig>`                           | Standalone configuration loader (called by the module's factory; exposed for tests + advanced use).                       |

### Types / Interfaces

| Export                                 | Description                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `StynxCoreModuleOptions<TSchema>`      | `forRoot()` options shape.                                                                                  |
| `StynxCoreModuleAsyncOptions<TSchema>` | `forRootAsync()` options shape.                                                                             |
| `RequestContextState`                  | Shape of the read-only request frame: `{ requestId, tenantId?, actorId?, sessionId?, locale?, startedAt }`. |
| `RequestContextPatch`                  | Mutator input shape: `{ tenantId?, actorId?, sessionId?, locale? }`.                                        |
| `StynxErrorOptions`                    | Constructor options for `StynxError` subclasses.                                                            |
| `ConfigKeyMetadata`                    | Per-config-key ownership marker: `{ owner, required?, secret?, description? }`.                             |
| `SystemExecutionContext`               | System-context marker (no actor, audit-relevant).                                                           |
| `StynxSsmOptions`                      | SSM hydration options: `{ enabled?, pathPrefix?, clientConfig? }`.                                          |

### Tokens

| Export                        | Used to                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `STYNX_CORE_OPTIONS`          | Inject the raw `StynxCoreModuleOptions` (rarely needed in app code; useful for plugin authors).                                 |
| `STYNX_CORE_CONFIG`           | Inject the resolved, validated config object.                                                                                   |
| `STYNX_SYSTEM_OPERATION_SINK` | DI slot for the audit sink `SystemContext` writes to. Default is a no-op; `@stynx/audit` rebinds it to its sink at module load. |

## Configuration

### `StynxCoreModule.forRoot()` options

| Option             | Type                                         | Default                                 | Description                                                                                                       |
| ------------------ | -------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `appName`          | `string`                                     | (required)                              | Used as the SSM path prefix's namespace and in audit records.                                                     |
| `envName`          | `string`                                     | `process.env.NODE_ENV ?? 'development'` | Distinguishes environments.                                                                                       |
| `schema`           | `ZodTypeAny`                                 | (required)                              | Zod schema describing the config shape. `StynxConfigService.get()` is fully typed against this.                   |
| `configMetadata`   | `Partial<Record<string, ConfigKeyMetadata>>` | `undefined`                             | Per-key ownership + secret markers. Enables ownership-violation checks.                                           |
| `defaults`         | `Partial<z.input<TSchema>>`                  | `undefined`                             | Defaults applied before schema validation.                                                                        |
| `ssm`              | `StynxSsmOptions`                            | `undefined` (disabled)                  | Enable AWS SSM hydration: `{ enabled: true, pathPrefix: '/my-app/dev/', clientConfig: { region: 'us-east-1' } }`. |
| `secretCacheTtlMs` | `number`                                     | `300_000` (5 min)                       | TTL for `SecretLoader`'s cache.                                                                                   |

### Environment variables read by core itself

The package itself reads no env vars directly. Your schema declares what `process.env` keys to read; `@stynx/core` validates them via Zod.

## Examples

### Example 1 — typed config + secret loading

```ts
import { Injectable } from '@nestjs/common';
import { SecretLoader, StynxConfigService } from '@stynx/core';

@Injectable()
export class DbProvisioner {
  constructor(
    private readonly config: StynxConfigService,
    private readonly secrets: SecretLoader,
  ) {}

  async connect() {
    const host = this.config.get('DATABASE_URL');
    const password = await this.secrets.load('db/main/password');
    // ... connect with host + password; password never logged
  }
}
```

### Example 2 — extending `StynxError` for your own package's errors

```ts
import { StynxError } from '@stynx/core';

export class OrderNotFoundError extends StynxError {
  constructor(orderId: string) {
    super(`Order ${orderId} not found`, {
      code: 'ORDER_NOT_FOUND',
      status: 404,
      context: { orderId },
    });
  }
}
```

Throwing `OrderNotFoundError` from a controller method produces a structured 404 response with the envelope `StynxErrorFilter` builds.

### Example 3 — reading tenant from request context

```ts
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx/core';

@Injectable()
export class TenantScopedRepo {
  constructor(private readonly ctx: RequestContext) {}

  async find() {
    const tenant = this.ctx.tenantId;
    if (!tenant) throw new Error('No tenant in request');
    // ... query with tenant scope
  }
}
```

In practice you'd use [`@stynx/tenancy`](/docs/packages/tenancy/) (W03 wave) for tenant scoping rather than raw `RequestContext`, but the underlying read goes through here.

## Common pitfalls

- **Reading `RequestContext` outside a request frame** throws `RequestContextMissingError`. This includes: code paths fired by cron jobs, message-queue consumers, app-bootstrap initializers. Use `SystemContext` in those paths.
- **Mutating `RequestContextMutator` from a controller** throws `RequestContextMutationError`. The mutation is supposed to happen exactly once at the request boundary (in a guard or middleware — e.g. `@stynx/auth`'s `AuthContextGuard`). If you find yourself wanting to mutate from controller code, the design is probably wrong.
- **Forgetting `StynxCoreModule.forRoot()` is global**. Importing it in a feature module instead of the app root works, but it shadows the global registration of the interceptor + filter. Always import at `AppModule` once.
- **Catching `StynxError` and rethrowing as `new Error()`** strips the structured envelope. Either re-throw the original, or build a new `StynxError` subclass that wraps it with `cause`.
- **Calling `SecretLoader.load()` at module-initialization time** can stall startup if AWS Secrets Manager has elevated latency. Load on first use, not at bootstrap.
- **SSM hydration enabled without IAM permissions**: bootstrap fails with `ConfigurationValidationError` because the SSM call returns nothing and required keys end up missing. Guard the `ssm.enabled` flag on a deployment marker.

## Related packages

- [`@stynx/contracts`](/docs/packages/contracts/) — the cross-package contracts that define what `RequestActor` / `DbContext` / error-envelope look like; `@stynx/core` implements them.
- [`@stynx/logging`](/docs/packages/logging/) — request-context-aware structured logging; depends on `@stynx/core`.
- [`@stynx/auth`](/docs/packages/auth/) — populates `RequestContextMutator` with `actorId` / `sessionId` from JWT claims.
- [`@stynx/tenancy`](/docs/packages/tenancy/) — populates `tenantId` and provides tenant-scoped DB context.
- [`@stynx/backend`](/docs/packages/backend/) — the meta-package that wires `@stynx/core` + identity + data + observability submodules into one cohesive aggregation layer.
- [STYNX framework — Architecture Guide](/docs/framework/architecture-guide) — high-level architecture overview; explains where `@stynx/core` sits in the stack.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-core/`](/docs/api-reference/stynx-core/)
