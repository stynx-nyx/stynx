# Feature Flags Contract

**Authority:** Architect (DEVAI Constitution Article 6).
**Package:** `@stynx/feature-flags`.

Feature flags are tenant and environment scoped configuration decisions. They
replace app-local process-parameter and normative-package patterns when the
behavior is generic platform rollout control rather than domain law.

## Naming

Flag names must follow:

```text
<domain>.<feature>
```

Examples:

- `billing.new-flow`
- `reports.export`
- `integration.renach-sandbox`

## FlagSet JSON Shape

```json
{
  "flags": {
    "billing.new-flow": {
      "default": false,
      "environments": {
        "staging": true
      },
      "tenants": {
        "tenant-a": true
      },
      "description": "Enable the new billing flow.",
      "owner": "billing"
    }
  }
}
```

Values may be booleans, strings, numbers, or shallow records containing those
primitive values.

## Evaluation Precedence

1. Tenant override.
2. Environment override.
3. Global default.
4. Caller fallback.

Tenant denies must not be bypassed by environment or global values.

## Audit Guidance

Consumers should record flag evaluations through `@stynx/audit` when a decision
changes workflow state, access to a user action, billing behavior, or external
integration routing.
