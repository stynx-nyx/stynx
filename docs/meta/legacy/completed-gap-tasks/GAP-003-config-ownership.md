# GAP-003 — Config: Per-Variable Ownership Metadata

**Priority:** MEANINGFUL  
**Package:** `packages/core`  
**Source of truth:** porm's `scripts/env/schema.cjs`  
**Run from:** `./stynx` repo root
**Status:** Complete

---

## Context

`@stynx-nyx/core`'s `StynxCoreModuleOptions` accepts a Zod schema but has no
concept of who _owns_ each config variable — which team or service is
responsible for it, whether it must be set at deploy time, and what happens if
it is absent.

porm's `scripts/env/schema.cjs` decorates every variable with `{ owner, required, secret }`
metadata. During startup, violations (missing required vars, wrong owner
claimed, secret variables appearing in logs) emit structured errors that CI and
ops can act on.

---

## Goal

Add an optional `ConfigKeyMetadata<T>` wrapper to `@stynx-nyx/core` so callers can
annotate Zod schemas with ownership metadata and receive a typed
`ConfigOwnershipViolationError` on startup violations.

---

## Step 1 — Read current state

Before writing any code, read these files in full:

- `packages/core/src/config.ts`
- `packages/core/src/errors.ts`
- `packages/core/src/index.ts`
- `packages/core/src/tokens.ts`

---

## Step 2 — Add `ConfigKeyMetadata` type to `packages/core/src/config.ts`

After the existing `StynxCoreModuleOptions` interface, add:

```typescript
export type ConfigOwner = string;

export interface ConfigKeyMetadata {
  owner: ConfigOwner;
  required?: boolean;
  secret?: boolean;
  description?: string;
}

export type AnnotatedSchema<TSchema extends ZodTypeAny> = {
  schema: TSchema;
  metadata?: Partial<Record<keyof z.infer<TSchema>, ConfigKeyMetadata>>;
};
```

Update `StynxCoreModuleOptions` to accept the annotation optionally:

```typescript
export interface StynxCoreModuleOptions<TSchema extends ZodTypeAny = ZodTypeAny> {
  appName: string;
  envName?: string;
  schema: TSchema;
  configMetadata?: Partial<Record<string, ConfigKeyMetadata>>; // ADD
  defaults?: Partial<z.input<TSchema>>;
  ssm?: StynxSsmOptions;
  secretCacheTtlMs?: number;
}
```

Add a validation helper at the bottom of `config.ts` that is called from
`loadStynxConfiguration` after the Zod parse:

```typescript
export function validateConfigOwnership<TSchema extends ZodTypeAny>(
  parsed: z.infer<TSchema>,
  metadata: Partial<Record<string, ConfigKeyMetadata>>,
): void {
  const violations: Array<{ key: string; reason: string }> = [];

  for (const [key, meta] of Object.entries(metadata)) {
    if (!meta) continue;

    const value = (parsed as Record<string, unknown>)[key];

    if (meta.required && (value === undefined || value === null || value === '')) {
      violations.push({ key, reason: `required by owner "${meta.owner}" but not set` });
    }
  }

  if (violations.length > 0) {
    throw new ConfigOwnershipViolationError(violations);
  }
}
```

Call `validateConfigOwnership` in `loadStynxConfiguration` if
`options.configMetadata` is defined:

```typescript
if (options.configMetadata) {
  validateConfigOwnership(config, options.configMetadata);
}
```

---

## Step 3 — Add `ConfigOwnershipViolationError` to `packages/core/src/errors.ts`

Add after the existing error classes:

```typescript
export interface ConfigViolation {
  key: string;
  reason: string;
}

export class ConfigOwnershipViolationError extends Error {
  readonly violations: ConfigViolation[];

  constructor(violations: ConfigViolation[]) {
    const summary = violations.map((v) => `${v.key}: ${v.reason}`).join('; ');
    super(`Config ownership violations: ${summary}`);
    this.name = 'ConfigOwnershipViolationError';
    this.violations = violations;
  }
}
```

---

## Step 4 — Export new types from `packages/core/src/index.ts`

The existing `export * from './config'` and `export * from './errors'` already
re-export everything. Verify that `ConfigKeyMetadata`, `ConfigOwner`,
`AnnotatedSchema`, `ConfigOwnershipViolationError`, and `ConfigViolation` appear
after the build with:

```bash
pnpm --filter @stynx-nyx/core build && node -e "const m = require('./packages/core/dist'); console.log(Object.keys(m))" | tr ',' '\n' | grep -i config
```

---

## Step 5 — Add unit test

In `test/packages/` (or wherever the `@stynx-nyx/core` unit tests live), add a test
file `config-ownership.test.ts`:

```typescript
// 1. Build a z.object schema with two keys: DB_URL (required) and LOG_LEVEL (optional)
// 2. Call validateConfigOwnership with metadata { DB_URL: { owner: 'platform', required: true } }
//    and a parsed object where DB_URL is '' — expect ConfigOwnershipViolationError
// 3. Call validateConfigOwnership with DB_URL present — expect no throw
// 4. Verify error.violations array shape
```

---

## Verification

```bash
# TypeScript builds
pnpm --filter @stynx-nyx/core build

# Unit tests pass
pnpm --filter @stynx-nyx/core test

# Lint clean
pnpm --filter @stynx-nyx/core lint
```

---

## Acceptance criteria

- [x] `ConfigKeyMetadata`, `ConfigOwner`, `AnnotatedSchema` are exported from `@stynx-nyx/core`
- [x] `ConfigOwnershipViolationError` is exported from `@stynx-nyx/core`
- [x] `StynxCoreModuleOptions` accepts `configMetadata`
- [x] `loadStynxConfiguration` throws `ConfigOwnershipViolationError` when a required key is absent
- [x] Unit test covers violation and non-violation paths
- [x] `pnpm build`, `pnpm test:unit`, `pnpm lint` all green
