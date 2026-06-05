# `@stynx/logging` — Pino-backed structured logging with request-context awareness

`@stynx/logging` is the structured-logging substrate. It wraps Pino with three additions: (1) automatic request-context fields (`requestId`, `tenantId`, `actorId`) injected on every log line via integration with `@stynx/core`'s `RequestContext`; (2) HTTP request-logging middleware that emits a single start + end log per request with timing; (3) a duplicate-log dedupe layer that suppresses repeated identical log lines within a sliding window (useful for guarding against tight-loop floods). Wire `StynxLoggingModule.forRoot()` once and inject `StynxLogger` everywhere.

## Purpose

Structured logging without context is half-useful: you see the message but not which request, tenant, or actor caused it. Pulling the context manually from every log site is repetitive + error-prone. `@stynx/logging` resolves this by reading `@stynx/core`'s `RequestContext` at log time and decorating every emitted record automatically. The Pino factory produces a logger pinned to the canonical schema (level / time / requestId / tenantId / actorId + message + structured fields), so all `@stynx/*` packages emit a consistent shape downstream consumers can parse.

You reach for `@stynx/logging` immediately after `@stynx/core`, when you want any kind of operational visibility above `console.log`. The HTTP middleware adds the per-request start/end markers; the `StynxLogger` service is what you inject into your own services.

What it does NOT do: it does not own log routing/sinks (Pino handles that — point its transport at stdout, a file, CloudWatch, Datadog, whatever). It does not own metrics (use `@stynx/health` for that). It does not transform logs at sink-time (use a separate Pino transport for processing).

## Audience

NestJS backend developers who want structured + context-aware logs from day one. Typical scenario: you bootstrap a STYNX app, mount `StynxLoggingModule.forRoot()` after `@stynx/core`, inject `StynxLogger` into your services, and your log aggregator immediately sees per-request correlation.

## Install

```bash
pnpm add @stynx/logging
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx/core` `^1`, `pino` `^9`, `zod` `^3`. Optional: `pino-pretty` `^11` for dev-mode pretty-printing.

**Node:** 24.x.

## Quick start

```ts
// src/app.module.ts
import { Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx/core';
import { StynxLoggingModule } from '@stynx/logging';

@Module({
  imports: [
    StynxCoreModule.forRoot({ appName: 'my-app', schema: ConfigSchema }),
    StynxLoggingModule.forRoot({
      level: 'info',
      // Optional dedupe to suppress identical messages within 5s
      dedupe: { windowMs: 5000 },
    }),
  ],
})
export class AppModule {}
```

```ts
// src/orders/orders.service.ts
import { Injectable } from '@nestjs/common';
import { StynxLogger } from '@stynx/logging';

@Injectable()
export class OrdersService {
  constructor(private readonly log: StynxLogger) {}

  async createOrder(input: CreateOrderInput) {
    this.log.log('Creating order', { fields: { orderId: input.id } });
    // ... your logic
    this.log.log('Order created', { fields: { orderId: input.id, total: input.total } });
  }
}
```

Each log line carries `requestId`, `tenantId`, `actorId` automatically — pulled from `@stynx/core`'s `RequestContext`.

## Public API surface

### Modules

| Export               | Signature                                 | Description                                                                                                                                     |
| -------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `StynxLoggingModule` | `.forRoot(options?: StynxLoggingOptions)` | Registers the Pino logger, `StynxLogger`, `RequestLoggingMiddleware`, and `LoggingDedupeService`. The middleware is auto-applied to all routes. |

### Services / Injectables

| Export                     | Description                                                                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StynxLogger`              | The injectable logger. Methods: `log(msg, ctx?)`, `warn`, `debug`, `verbose`, `error(msg, ctx?, error?)`. Each method reads the current `RequestContext` and decorates the emitted log line. |
| `RequestLogFieldFactory`   | Lower-level: factory that builds the per-log structured fields from `RequestContext` + caller-supplied fields. Exposed for advanced use (e.g. building a custom logger).                     |
| `RequestLoggingMiddleware` | NestJS middleware that emits a start + end log per HTTP request with method + path + status + duration. Registered automatically.                                                            |
| `LoggingDedupeService`     | Sliding-window dedupe over (level + message + context-hash). Suppresses repeated identical lines. Configurable via `dedupe.windowMs`.                                                        |

### Functions

| Export             | Signature                                  | Description                                                                             |
| ------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `createPinoLogger` | `(options: StynxLoggingOptions) => Logger` | Standalone Pino factory used by the module. Exposed for tests + advanced custom wiring. |

### Types / Interfaces

| Export                   | Description                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `StynxLoggingOptions`    | `forRoot()` options shape: `{ level?, redact?, dedupe?, transports?, ... }`.               |
| `LogContext`             | What you pass to `StynxLogger.log()`: a string label OR a `RequestScopedLogFields` object. |
| `RequestScopedLogFields` | `{ fields?: Record<string, unknown>, requestId?, tenantId?, actorId? }`.                   |

### Tokens

| Export                  | Used to                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `STYNX_LOGGING_OPTIONS` | Inject the raw options.                                                                  |
| `STYNX_PINO_LOGGER`     | Inject the underlying `pino.Logger` directly (rarely needed; use `StynxLogger` instead). |

## Configuration

### `StynxLoggingModule.forRoot()` options

| Option        | Type                                                                       | Default     | Description                                               |
| ------------- | -------------------------------------------------------------------------- | ----------- | --------------------------------------------------------- |
| `level`       | `'fatal' \| 'error' \| 'warn' \| 'info' \| 'debug' \| 'trace' \| 'silent'` | `'info'`    | Pino log level.                                           |
| `redact`      | `string[]`                                                                 | `[]`        | Pino redact paths (e.g. `['req.headers.authorization']`). |
| `dedupe`      | `{ windowMs: number; maxSize?: number }`                                   | disabled    | Sliding-window dedupe.                                    |
| `transports`  | `pino.TransportTargetOptions[]`                                            | stdout JSON | Pino transports (`pino-pretty`, file rotation, etc.).     |
| `prettyPrint` | `boolean`                                                                  | `false`     | Shorthand for `pino-pretty` in dev.                       |

## Examples

### Example 1 — adding structured fields

```ts
this.log.log('Charge captured', {
  fields: { amountCents: 1999, currency: 'USD', stripeChargeId: 'ch_...' },
});
```

The emitted JSON has `amountCents`, `currency`, `stripeChargeId` as top-level structured fields, alongside `requestId` + `tenantId` from `RequestContext`.

### Example 2 — dev-mode pretty printing

```ts
StynxLoggingModule.forRoot({
  level: 'debug',
  prettyPrint: process.env.NODE_ENV !== 'production',
});
```

### Example 3 — error with cause

```ts
try {
  await something();
} catch (err) {
  this.log.error('Something failed', { fields: { orderId } }, err);
}
```

`StynxLogger.error()` accepts the error as the third arg and serialises it via Pino's err-serialiser (stack, message, code).

## Common pitfalls

- **Logging outside an active request frame** (cron job, queue consumer) — request-scoped fields will be undefined. This is benign: the log line still emits, just without `requestId` etc. If you want to mark these as system operations, use `SystemContext` from `@stynx/core`.
- **High-volume tight loops** can flood your log aggregator. Either enable `dedupe.windowMs`, or move to a debug level + sampling.
- **Pretty printing in production** noticeably degrades throughput. `prettyPrint` should be false in prod.
- **`StynxLogger.log()` instead of `console.log`** in tests — set `level: 'silent'` in tests OR use a Pino transport that buffers to memory; otherwise tests are very loud.

## Related packages

- [`@stynx/core`](/docs/packages/core/) — provides the `RequestContext` that this package's middleware reads on every request.
- [`@stynx/audit`](/docs/packages/audit/) — emits audit events through a separate sink, but the audit-event metadata mirrors logging's request-scoped fields.
- [`@stynx/health`](/docs/packages/health/) — for operational metrics that don't belong in logs.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-logging/`](/docs/api-reference/stynx-logging/)
