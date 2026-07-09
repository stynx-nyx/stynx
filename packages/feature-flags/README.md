# `@stynx-nyx/feature-flags` — minimal feature-flag contract with in-memory default + pluggable providers

`@stynx-nyx/feature-flags` is a minimal feature-flag contract. It exposes `FeatureFlagProvider.evaluate(flag, context)` returning a typed `FlagEvaluation`. Default provider reads from a static `FlagSet` (in-memory + file-backed). Custom providers (LaunchDarkly, Unleash, your own) implement the interface.

## Purpose

Feature flags + experimentation tooling is a big ecosystem; most STYNX apps don't need a full platform. `@stynx-nyx/feature-flags` provides the _contract_ so per-app feature toggles use a consistent shape, while leaving the provider implementation open for swap-in if/when you scale to a hosted service.

You reach for it any time you want to gate a code path behind a flag. Start with the in-memory provider; swap to LaunchDarkly later without touching call sites.

What it does NOT do: it doesn't run experiments (no A/B + analytics). It doesn't ship a UI for managing flags. It doesn't ship adapters for hosted services (you implement that adapter against the provider contract).

## Audience

Backend developers gating new code paths.

## Install

```bash
pnpm add @stynx-nyx/feature-flags
```

**Peer dependencies:** `@stynx-nyx/core` `^1` (for `RequestContext` projection into `FlagContext`).

## Quick start

```ts
import { InMemoryFeatureFlagProvider } from '@stynx-nyx/feature-flags';

const provider = new InMemoryFeatureFlagProvider({
  flags: {
    'new-checkout-flow': { value: false, rolloutPct: 10 },
  },
});

const evalResult = await provider.evaluate('new-checkout-flow', {
  actorId: 'user-1',
  tenantId: 'tenant-a',
});
if (evalResult.value) {
  /* show new flow */
}
```

## Public API surface

### Types / Interfaces

| Export                | Description                                                                         |
| --------------------- | ----------------------------------------------------------------------------------- |
| `FeatureFlagProvider` | The provider contract: `evaluate(flag, context): Promise<FlagEvaluation>`.          |
| `FlagDefinition`      | `{ value, rolloutPct?, predicate? }`.                                               |
| `FlagEvaluation`      | `{ value: FlagValue, reason: 'static' \| 'rollout' \| 'predicate' \| 'fallback' }`. |
| `FlagContext`         | Per-evaluation context: `{ actorId, tenantId, attrs? }`.                            |
| `FlagSet`             | `Record<string, FlagDefinition>`.                                                   |
| `FlagValue`           | `boolean \| string \| number`.                                                      |

### Default impl

| Export                        | Description                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `InMemoryFeatureFlagProvider` | Reads from a static `FlagSet`. Supports rollout-percentage via deterministic actor hash. |
| `loadFlagSet`                 | `(path: string): Promise<FlagSet>` — load a JSON file into a `FlagSet`.                  |

## Configuration

This package exposes no NestJS module — providers are instantiated and injected manually (or via your own DI registration). Typical pattern:

```ts
@Module({
  providers: [
    {
      provide: 'FeatureFlags',
      useFactory: async () =>
        new InMemoryFeatureFlagProvider({
          flags: await loadFlagSet(process.env.FLAGS_PATH ?? './flags.json'),
        }),
    },
  ],
  exports: ['FeatureFlags'],
})
export class FeatureFlagsModule {}
```

## Examples

### Example 1 — boolean flag with rollout

```ts
flags: {
  'new-flow': { value: true, rolloutPct: 25 },
}
// Evaluates to true for ~25% of actors (deterministic by actorId hash)
```

### Example 2 — predicate flag

```ts
flags: {
  'admin-features': {
    value: false,
    predicate: (ctx) => ctx.attrs?.role === 'admin',
  },
}
```

### Example 3 — custom provider (LaunchDarkly-style)

```ts
class LaunchDarklyProvider implements FeatureFlagProvider {
  async evaluate(flag: string, ctx: FlagContext): Promise<FlagEvaluation> {
    const value = await ldClient.variation(flag, { key: ctx.actorId }, false);
    return { value, reason: 'static' };
  }
}
```

## Common pitfalls

- **Flag context not derived from request** — if your code doesn't pass actor + tenant, rollouts behave as anonymous. Wire via `@stynx-nyx/core`'s `RequestContext` at the controller layer.
- **File-backed flag refresh latency** — `loadFlagSet()` reads once. For runtime updates, swap the provider or wrap with a TTL-cached refresher.
- **Rollout percentage drift across instances** — `InMemoryFeatureFlagProvider` uses a deterministic hash of `actorId`; same actor sees same flag value across instances. If you change the hash strategy, the cohort shifts.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` for `FlagContext` projection.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-feature-flags/`](/docs/api-reference/stynx-feature-flags/)
