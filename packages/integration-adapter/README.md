# `@stynx-nyx/integration-adapter` — outbound adapters and signed inbound webhooks

`@stynx-nyx/integration-adapter` supplies shared outbound adapter contracts and
runtime helpers, plus raw-body HMAC verification for inbound webhooks. Domain
packages and applications own their provider-specific request and response
types.

## Purpose

STYNX 1.5 also provides `verifyWebhookSignature` for inbound signed webhooks.
Pass the original `rawBody: Buffer`, Node's lowercase `headers`, a secret,
clock, maximum timestamp skew, namespace, and a shared atomic replay store.
The default signature is `sha256=<64 hex digits>` over
`<Unix-seconds timestamp>.<raw body>`. A successful result carries the
timestamp and reserved replay key; a rejection carries a stable reason.
Configure `message` when authenticated tenant or event fields must be covered
by the HMAC. Keep the replay store shared across instances.

Apps making 3rd-party HTTP calls accumulate bespoke retry + circuit-break + idempotency-cache code. Each implementation has subtly different semantics, observability output, and failure modes. `@stynx-nyx/integration-adapter` resolves it by providing the contract and the typed telemetry event shape; implementations wrap their HTTP client (axios, undici, native fetch) in the contract.

You reach for it when authoring a new outbound integration in your STYNX app.

What it does NOT do: it doesn't ship a default HTTP client (you bring your own). It doesn't ship default retry/circuit-break policies (the type is yours to instantiate). It doesn't proxy or do service-mesh duties.

## Audience

Backend developers building outbound integrations to 3rd-party APIs (payment processors, SMS providers, regulatory endpoints, etc.).

## Install

```bash
pnpm add @stynx-nyx/integration-adapter
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference). **No HTTP client dependency** — bring your own.

## Quick start

```ts
import type {
  IntegrationAdapter,
  IntegrationContext,
  RetryPolicy,
  CircuitBreakerPolicy,
} from '@stynx-nyx/integration-adapter';

const retryPolicy: RetryPolicy = { maxAttempts: 3, backoffMs: 200 };
const cbPolicy: CircuitBreakerPolicy = { failureThreshold: 5, resetMs: 30_000 };

export class StripeAdapter implements IntegrationAdapter<StripeRequest, StripeResponse> {
  async call(req: StripeRequest, ctx: IntegrationContext): Promise<StripeResponse> {
    // ... your impl using axios/undici/fetch
    // retry per retryPolicy, circuit-break per cbPolicy, telemetry on each event
  }
}
```

## Public API surface

### Types / Interfaces

| Export                                    | Description                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IntegrationAdapter<TRequest, TResponse>` | The contract: `call(request, ctx): Promise<response>`.                                                                                                                    |
| `IntegrationAdapterOptions`               | Per-adapter config shape: retry, circuit-break, telemetry, idempotency.                                                                                                   |
| `IntegrationContext`                      | Per-call context: `{ requestId, tenantId, actorId, correlationId }` — typically projected from `@stynx-nyx/core`'s `RequestContext`.                                      |
| `RetryPolicy`                             | `{ maxAttempts, backoffMs, jitter?, retryableErrors? }`.                                                                                                                  |
| `CircuitBreakerPolicy`                    | `{ failureThreshold, resetMs, halfOpenProbes? }`.                                                                                                                         |
| `CircuitBreaker`                          | Stateful breaker the adapter holds (or borrows from a registry).                                                                                                          |
| `CircuitSnapshot`                         | Observable state: `{ state: 'closed'\|'open'\|'half-open', failureCount, openedAt? }`.                                                                                    |
| `IntegrationTelemetryEvent`               | Structured event type emitted at every call boundary: `'call_started'`, `'call_succeeded'`, `'call_failed'`, `'retry_scheduled'`, `'circuit_opened'`, `'circuit_closed'`. |
| `IdempotencyStore`                        | Re-exported from `@stynx-nyx/contracts`; outbound idempotency-cache contract (rarely used — usually upstream idempotency is enough).                                      |

## Configuration

Outbound runtime configuration is per adapter. Recommended convention: each
adapter accepts an `IntegrationAdapterOptions` in its constructor. Inbound
verification receives explicit `WebhookVerificationOptions` on each call;
`@stynx-nyx/backend` provides the Nest guard and module wiring.

## Examples

### Example 1 — minimal axios adapter

```ts
import axios from 'axios';

export class SmsProviderAdapter implements IntegrationAdapter<SendSmsReq, SendSmsRes> {
  constructor(private readonly options: IntegrationAdapterOptions) {}

  async call(req: SendSmsReq, ctx: IntegrationContext): Promise<SendSmsRes> {
    let attempt = 0;
    while (attempt < this.options.retry.maxAttempts) {
      try {
        const r = await axios.post('https://sms.example/send', req, {
          headers: { 'x-correlation-id': ctx.correlationId },
        });
        this.emit({ kind: 'call_succeeded', attempt, durationMs: r.duration });
        return r.data;
      } catch (e) {
        attempt += 1;
        if (attempt >= this.options.retry.maxAttempts) throw e;
        await sleep(this.options.retry.backoffMs);
      }
    }
  }
}
```

### Example 2 — telemetry event observation

```ts
adapter.on('integration:event', (event: IntegrationTelemetryEvent) => {
  logger.log(event.kind, { fields: event });
});
```

### Example 3 — wiring with `@stynx-nyx/core`'s `RequestContext`

```ts
@Injectable()
export class PaymentService {
  constructor(
    private readonly adapter: StripeAdapter,
    private readonly ctx: RequestContext,
  ) {}

  async charge(req: ChargeReq) {
    return this.adapter.call(req, {
      requestId: this.ctx.requestId,
      tenantId: this.ctx.tenantId,
      actorId: this.ctx.actorId,
      correlationId: req.idempotencyKey,
    });
  }
}
```

## Common pitfalls

- **Retrying non-idempotent operations** — a half-failed POST that does fire the side-effect remotely, but you retry, causes double-action. Either use the provider's idempotency mechanism (`Idempotency-Key` header) or do not retry non-idempotent calls.
- **Open circuit breaker silently failing downstream requests** — make sure your telemetry surfaces `circuit_opened` events to your monitoring; otherwise the breaker is invisible.
- **Sharing one breaker across multiple tenants** — a single tenant's failures open the breaker for all. Consider per-(tenant, integration) breakers if your traffic shape requires.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` used to build `IntegrationContext`.
- [`@stynx-nyx/contracts`](/docs/packages/contracts/) — defines `IdempotencyStore`.
- [`@stynx-nyx/logging`](/docs/packages/logging/) — receive telemetry events for log routing.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-integration-adapter/`](/docs/api-reference/stynx-integration-adapter/)

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

_None._

### Optional dependencies

_None._

### Peer dependencies

_None._

### Development-only dependencies

- `@types/node`: `24.13.4`
- `typescript`: `^6.0.3`

<!-- stynx:generated-dependencies:end -->
