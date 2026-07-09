# Integration Adapter Contract

**Authority:** Architect (DEVAI Constitution Article 6).
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

## Upcoming Consumers

PEC R2 should migrate RENACH, SEFAZ, councils, toxicology, biometric, and TSA
adapters. TEAT R2 should migrate RENAINF, RENAVAM, RENACH, RENAEST, SNE/CDT,
DETRAN, municipal, and tow/yard adapters.
