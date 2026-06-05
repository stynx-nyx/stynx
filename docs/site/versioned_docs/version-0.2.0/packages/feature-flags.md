---
title: '@stynx/feature-flags'
---

# @stynx/feature-flags

`@stynx/feature-flags` provides a canonical tenant and environment scoped flag
API. PEC currently models similar behavior through process parameters; TEAT uses
normative packages; SGP and PORM carry ad-hoc configuration layers. This package
turns those patterns into one STYNX-owned contract.

## Public API

```ts
import { FeatureFlagsService, InMemoryFeatureFlagProvider } from '@stynx/feature-flags';

const service = new FeatureFlagsService(
  new InMemoryFeatureFlagProvider({
    flags: {
      'billing.new-flow': {
        default: false,
        environments: { staging: true },
        tenants: { 'tenant-a': true },
      },
    },
  }),
);

const enabled = await service.isEnabled('billing.new-flow', {
  tenantId: 'tenant-a',
  environment: 'production',
});
```

## Decision Model

Resolution is deterministic:

1. tenant override;
2. environment override;
3. global default;
4. caller fallback.

Variants use the same precedence. Flag names must use `&lt;domain&gt;.&lt;feature&gt;`.

## Providers

The first release includes:

- `InMemoryFeatureFlagProvider` for tests and embedded static configuration;
- `JsonFileFeatureFlagProvider` for local fixtures and small deployments;
- `FeatureFlagProvider` interface for database or remote providers.

## Audit Trail

Flag evaluations can alter user-visible behavior. Consumers should emit
evaluation facts to `@stynx/audit` where the decision affects workflow state,
accessibility of a domain action, billing behavior, or integration routing.

## Security and Tenancy

Providers must treat `tenantId` as the strongest selector. Domain code must not
fall back to global flags when a tenant-specific deny exists.
