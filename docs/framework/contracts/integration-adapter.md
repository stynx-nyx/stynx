# Integration Adapter Contract

**Status:** Architecture contract.
**Package:** `@stynx-nyx/integration-adapter`.

This contract defines the shared adapter pattern for external state-system calls.
It is intentionally schema-agnostic: PEC, TEAT, SGP, and PORM own their own
request and response types.

## Adapter Options

| Field               | Required | Description                                              |
| ------------------- | -------- | -------------------------------------------------------- |
| `name`              | yes      | Stable adapter name for logs and metrics.                |
| `request`           | yes      | Provider call implementation.                            |
| `parseResponse`     | yes      | Provider response normalization.                         |
| `idempotencyKey`    | no       | Stable key for mutating calls.                           |
| `retryPolicy`       | no       | Max attempts, base delay, cap, jitter, and retryability. |
| `timeoutMs`         | no       | Per-attempt timeout budget.                              |
| `circuitBreakerKey` | no       | Key for provider or tenant/provider circuit state.       |
| `telemetry`         | no       | Hook for logging and audit bridges.                      |

## Execution Semantics

1. Check idempotency cache.
2. Check circuit state.
3. Execute request with timeout.
4. Parse response into the consumer-owned response type.
5. Store idempotency result if configured.
6. Record circuit success or failure.
7. Emit telemetry for start, success, retry, failure, circuit-open, and
   idempotency-hit events.

## State-System Layering

State-system adapters layer their legal request/response schemas on top of this
framework. The framework owns the mechanics; the consumer repo owns provider
semantics, validation, homologation evidence, and domain error mapping.

## Signed inbound webhooks (STYNX 1.5)

`verifyWebhookSignature(input, options)` is the Nest-independent inbound
verification API. `input.rawBody` must be the original `Buffer` received by the
HTTP adapter; `input.headers` uses Node's lowercase header map. Configure a
nonempty secret, `clock.now()`, positive finite `maxSkewMs`, a shared atomic
`WebhookReplayStore.consume(key, expiresAt)`, and a nonempty
`replayNamespace`. The default headers are `x-webhook-timestamp` and
`x-webhook-signature`, and the signed bytes are the UTF-8 Unix-seconds
timestamp, a period, and the raw body. The signature must be
`sha256=<64 hex digits>`. Header names, signed message bytes, and the
authenticated replay-key suffix may be configured in the options.

The result is a discriminated `WebhookVerificationResult`: successful results
contain `timestamp` in Unix seconds and the consumed `replayKey`; rejections
contain a stable `WebhookVerificationFailure` reason. A replay-store exception
is exposed as `WebhookReplayStoreError`. No in-memory replay store is supplied:
the host provides a store shared by all application instances. Any identity
used by a configured replay key or by a post-verification callback must be
authenticated by the configured message bytes or a trusted host mapping.

For Nest applications, `@stynx-nyx/backend` exports
`StynxWebhookSignatureModule.forRoot(options)` and `WebhookSignatureGuard`.
Enable Nest's `rawBody: true` at bootstrap and apply the guard to the route.
The guard clears request identity before verification, responds 401 to
discriminated rejections, 503 to a replay-store outage, and 500 to callback or
clock failure. A successful `onVerified` callback may establish only identity
derived from signed fields or a trusted sender mapping. The tenancy handoff
and supported guard order are defined in
[`utilities-1.5.md`](./utilities-1.5.md).

## Upcoming Consumers

PEC R2 should migrate RENACH, SEFAZ, councils, toxicology, biometric, and TSA
adapters. TEAT R2 should migrate RENAINF, RENAVAM, RENACH, RENAEST, SNE/CDT,
DETRAN, municipal, and tow/yard adapters.
