# @stynx/integration-adapter

`@stynx/integration-adapter` is the generic state-system integration framework
for STYNX consumers. It standardizes retry, timeout, idempotency, circuit
breaking, and telemetry while keeping request/response schemas repo-local.

PEC R2 will migrate RENACH, SEFAZ, councils, toxicology, biometric, and TSA
adapters onto this package. TEAT R2 can use the same pattern for RENAINF,
RENAVAM, RENACH, RENAEST, SNE/CDT, DETRAN, municipal, and tow/yard adapters.

## Public API

```ts
import { IntegrationAdapter } from '@stynx/integration-adapter';

const adapter = new IntegrationAdapter({
  name: 'renach',
  request: async (input: { processId: string }) => ({ ok: true, input }),
  parseResponse: (raw) => raw,
  idempotencyKey: (input) => input.processId,
  retryPolicy: { maxAttempts: 3, baseDelayMs: 100 },
  timeoutMs: 3000,
  circuitBreakerKey: () => 'renach',
});
```

## Authoring A New Adapter

1. Define request and response types in the consumer repo.
2. Implement `request(input, context)` using the official provider protocol.
3. Implement `parseResponse(raw, input, context)`.
4. Provide an `idempotencyKey` for mutating operations.
5. Configure retry and timeout budgets from environment-specific settings.
6. Use `circuitBreakerKey` for each external provider or tenant/provider pair.

## Built-in Policies

- Exponential backoff with optional jitter.
- Deadline-aware timeout wrapping every request attempt.
- In-process circuit breaker with closed, open, and half-open states.
- In-memory idempotency store for tests and local adapters.

Durable idempotency, distributed circuit state, and provider-specific schemas
belong in the consuming repo or a later STYNX provider package.

## Telemetry

The package emits structured lifecycle events through the optional
`IntegrationTelemetry` hook. Host applications should bridge those events to
`@stynx/logging` and, when calls mutate legal or workflow state, `@stynx/audit`.
