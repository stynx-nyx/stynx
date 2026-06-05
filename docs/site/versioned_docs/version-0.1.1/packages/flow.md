---
title: '@stynx/flow'
---

# @stynx/flow

Tenant-scoped workflow design, runtime, forms, policies, analytics, and PORM-compatible migration aliases.

## Purpose

Tenant-scoped workflow design, runtime, forms, policies, analytics, and PORM-compatible migration aliases.

## Install And Import

```ts
import {} from /* public exports */ '@stynx/flow';
```

In this monorepo, use the workspace package. Published consumers should install matching `@stynx/*` versions from the same release train.

## Module Setup

Import `StynxFlowModule` after auth, data, tenancy, idempotency, and platform request context are configured.

```ts
@Module({
  imports: [StynxFlowModule.forRoot({ adapters: [domainAdapter] })],
})
export class FlowHostModule {}
```

## Data And Security Model

Stores Flow design/runtime data under the flow schema, emits signals on answer/waiver mutation, and requires DML audit triggers on current curated Flow live tables. Domain behavior enters through adapters and declarative effect payloads.

## Example

```ts
import { FlowRuntimeService } from '@stynx/flow';

await flowRuntime.signal({
  tenantId,
  kind: 'record.changed',
  subjectId: recordId,
});
```

## Public API

- FlowDesignService
- FlowFormsService
- FlowRuntimeService
- FlowAnalyticsService
- FlowPolicyService
- StynxFlowModule
- domain adapter contracts
- row utils, validation schemas, tokens, and types

Current barrel highlights:

- `export * from './flow-design.service'`
- `export * from './flow-forms.service'`
- `export * from './flow-analytics.service'`
- `export * from './flow-policy.service'`
- `export * from './flow-runtime.service'`
- `export * from './flow.module'`
- `export * from './adapters'`
- `export * from './tokens'`
- `export * from './row-utils'`
- `export * from './types'`
- `export * from './validation'`

## Verification

```sh
pnpm --filter @stynx/flow build
pnpm --filter @stynx/flow test
STYNX_TEST_PG_HOST=localhost pnpm --filter @stynx/flow test:int
```

## Documentation Standard

The public barrel must carry package-level `@packageDocumentation`. Add symbol-level TSDoc for exported services, modules, guards, interceptors, decorators, adapters, errors, and public options when the type name is not self-explanatory.

## Compatibility

| Package version | Node | pnpm | STYNX spec              |
| --------------- | ---- | ---- | ----------------------- |
| 1.x             | 24.x | 9.x  | v0.6 / v1.0 remediation |

## References

- [docs/arch/developer-documentation.md](/docs/arch/developer-documentation)
- [docs/stynx/package-architecture.md](/docs/narrative/stynx/package-architecture)
- [docs/arch/flow.md](/docs/arch/flow)
- [docs/contracts/flow-api.md](/docs/contracts/flow-api)
