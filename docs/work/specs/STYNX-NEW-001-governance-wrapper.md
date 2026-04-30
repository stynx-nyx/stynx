# STYNX-NEW-001 — `@stynx/governance` Wrapper Package

**Priority:** CRITICAL — required for topology (b) adoption
**Package:** `packages/governance` (new)
**Source of truth:** `stech-law` repo + `tools/devai`
**Run from:** `./stynx` repo root
**Status:** Proposed
**Law-Compliance:** LAW-02.PLATFORM.1, LAW-02.LAYERS.4, LAW-02.FORBID.6, LAW-00.CONSUME.1

---

## Context

The constitution adopts **topology (b)**: Domain projects depend ONLY on
`@stynx/*` packages and reach Governance and Constitution transitively.
Per LAW-02.LAYERS.4, Domain MUST NOT list `devai` or `stech-law` in
their `package.json`.

For this to work, stynx must ship a Platform-layer package that:

1. Pins a known-compatible `devai` version per Platform release.
2. Re-exposes devai's CLI surface so Domain teams invoke it via stynx.
3. Bundles default `devai.config.json` snippets aware of Platform
   conventions (`@stynx/data` schemas, `@stynx/audit` evidence
   directories, etc.).
4. Registers the `.claude/commands/` and `.codex/skills/` prompts that
   `@stynx/*` packages contribute (per LAW-12.REG.\*).
5. Runs as Domain's bootstrap entry: `pnpm stynx-gov init` delegates
   to `devai init` with stynx's defaults pre-applied.

This package is the operational bridge from "constitution exists" to
"Domain can comply by installing one thing".

---

## Goal

Create `packages/governance` as a new `@stynx/*` workspace package
that:

- Declares `devai@^1` as a regular dependency.
- Declares `stech-law@^1` as a transitive dependency (via devai).
- Exposes a CLI binary `stynx-gov` that delegates every command to the
  bundled devai installation.
- Ships a default `devai.config.json` template under
  `packages/governance/templates/devai.config.default.json`.
- Provides a programmatic API for Platform packages to register their
  prompts/skills with the wrapper at install time.

---

## Step 1 — Read current state

Before writing any code, read these files in full:

- `pnpm-workspace.yaml` (confirm package layout pattern)
- `packages/core/package.json` (canonical Platform package shape)
- `packages/core/src/index.ts` (canonical exports map)
- `tools/devai/package.json` (understand devai's published surface)
- `tools/devai/src/cli.ts` (understand command dispatch)
- `tools/devai/src/index.ts` (programmatic API surface)
- `stech-law/package.json` (consumed transitively)

---

## Step 2 — Create `packages/governance/package.json`

```json
{
  "name": "@stynx/governance",
  "version": "0.1.0",
  "description": "Stynx Platform wrapper around devai. Re-exposes devai CLI for Domain consumption per LAW-02.PLATFORM.1.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./templates/devai.config.default.json": "./templates/devai.config.default.json"
  },
  "bin": {
    "stynx-gov": "./bin/stynx-gov.mjs"
  },
  "files": ["dist/**", "bin/**", "templates/**"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "dependencies": {
    "devai": "^1.0.0",
    "execa": "^9"
  },
  "peerDependencies": {
    "stech-law": "^1.0.0"
  },
  "engines": { "node": ">=24 <25" }
}
```

`stech-law` is a peer dependency declared by `devai` itself — listing
it here ensures version visibility but doesn't double-install.

---

## Step 3 — Create `bin/stynx-gov.mjs`

Thin shim that delegates to devai with Platform defaults injected:

```js
#!/usr/bin/env node
import { execa } from 'execa';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, copyFileSync } from 'node:fs';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const devaiBin = join(pkgRoot, 'node_modules', '.bin', 'devai');

const args = process.argv.slice(2);

// `stynx-gov init` → seed devai.config.json from Platform defaults if absent
if (args[0] === 'init') {
  const cwd = process.cwd();
  const target = join(cwd, 'devai.config.json');
  if (!existsSync(target)) {
    copyFileSync(join(pkgRoot, 'templates', 'devai.config.default.json'), target);
    console.log('[stynx-gov] Wrote devai.config.json from Platform defaults');
  }
}

const result = await execa(devaiBin, args, {
  stdio: 'inherit',
  reject: false,
});
process.exit(result.exitCode ?? 0);
```

Mark executable: `chmod +x bin/stynx-gov.mjs`.

---

## Step 4 — Create `src/index.ts` programmatic API

```ts
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Path to the bundled default devai.config.json template. */
export const defaultDevaiConfigPath = join(pkgRoot, 'templates', 'devai.config.default.json');

/** Re-export of devai's programmatic API for Platform-internal use. */
export { lawIndex, lawFile, lawVersion } from 'devai/law';

/**
 * Hook for `@stynx/*` packages to register their devai prompts/skills
 * with the wrapper. Called at workspace install time.
 */
export interface PromptRegistration {
  packageName: string;
  prompts: Array<{
    id: string;
    class: 'coding-agent' | 'review-agent' | 'ops-agent';
    permissionTier: 'read' | 'write' | 'act';
  }>;
  skills: Array<{ id: string; runtime: string }>;
}

export function registerPrompts(_registration: PromptRegistration): void {
  // Implementation in Step 5 — writes to the host's prompts/registry.json
  // and skills/registry.json after dedup.
  throw new Error('Not yet implemented — see STYNX-NEW-001 Step 5');
}
```

---

## Step 5 — Implement registry merge

Each `@stynx/*` package that ships prompts/skills declares them under
`packages/<name>/governance/{prompts,skills}.json`. At workspace
install time (or via `stynx-gov sync-registries`), the wrapper:

1. Walks `node_modules/@stynx/*/governance/{prompts,skills}.json`.
2. Merges entries into the host's `prompts/registry.json` and
   `skills/registry.json`.
3. Validates against the devai schemas (`prompts.registry.schema.json`,
   `skills.registry.schema.json`).
4. Refuses on `prompt_id` collision unless explicitly resolved.

Implementation: `src/registry-merge.ts`. Tests in
`test/registry-merge.test.ts`.

---

## Step 6 — Create `templates/devai.config.default.json`

The Platform-aware default config that every Domain inherits:

```json
{
  "$schema": "node_modules/devai/schemas/devai.config.schema.json",
  "name": "<host-name>",
  "version": 1,
  "roots": {
    "host": ".",
    "governance": "docs/gov",
    "work": "docs/work",
    "retainedEvidence": "evidence"
  },
  "sourceDocs": ["docs/eng"],
  "plant": {
    "sourceGlobs": ["src/**/*.ts", "database/**/*.sql"],
    "testGlobs": ["test/**/*.{ts,spec.ts,test.ts}", "src/**/*.spec.ts"]
  },
  "outputs": {
    "healthStatus": "evidence/health-status.json",
    "preflight": "evidence/preflight.md",
    "scorecards": "docs/gov/compliance/scorecard-*.md",
    "rtdManifest": "docs/gov/rtd/current/rtd.manifest.json",
    "controlPlaneEvidence": "evidence"
  },
  "protectedSurfaces": ["src/auth/**", "src/@core/security/**", "database/**"],
  "policyPacks": ["node_modules/@stynx/governance/policy-packs/**/*.json"],
  "guards": {
    "traceResolution": { "requireFiles": true, "requireInvariantIdInFile": true },
    "testWeakening": {
      "thresholds": {
        "maxAssertionDecreaseRatio": 0.2,
        "maxAssertionDecreaseAbs": 1,
        "allowIfTestCasesIncrease": true
      }
    }
  }
}
```

Hosts SHOULD override `name` after `stynx-gov init` runs. Other fields
inherit until the host has reason to diverge.

---

## Step 7 — Wire into `pnpm-workspace.yaml` and add to LAW-02 inventory

- Confirm `packages/governance` is matched by the workspace globs.
- Add `@stynx/governance` to the canonical Platform inventory list in
  `stynx/AGENTS.md` (which is the source of truth per
  LAW-02.PLATFORM.1).

---

## Step 8 — Reference app integration

Per LAW-02.PROMOTE.3, the reference app demonstrates every mandatory
pattern. Update `apps/reference-api/`:

- Add `@stynx/governance` to `package.json` devDependencies.
- Add `pnpm stynx-gov init` to the bootstrap script.
- Commit a generated `devai.config.json` matching the default
  template.
- CI runs `pnpm stynx-gov check --hard-fails`.

---

## Step 9 — Update Domain bootstrap script

The mandatory `pnpm bootstrap` script (per LAW-08.LOCAL.3) MUST invoke
`pnpm stynx-gov init` at the appropriate step. Update the
`@stynx/scaffold` template (see STYNX-NEW-002) accordingly.

---

## Step 10 — Add unit + integration tests

- `test/cli-delegation.test.ts` — `stynx-gov check` delegates to devai
  with correct args.
- `test/registry-merge.test.ts` — merge dedup, collision handling,
  schema validation.
- `test/init-bootstrap.test.ts` — `stynx-gov init` writes
  `devai.config.json` from the template only when absent.
- `test/template-defaults.test.ts` — the bundled template parses
  against `devai`'s JSON schema.

---

## Verification

```bash
pnpm --filter @stynx/governance build
pnpm --filter @stynx/governance test
pnpm --filter @stynx/governance lint

# E2E in reference app
cd apps/reference-api
pnpm install
pnpm stynx-gov init
pnpm stynx-gov check --hard-fails
```

---

## Acceptance criteria

- [ ] `@stynx/governance` is published as a workspace package.
- [ ] `stynx-gov` CLI installs and delegates to devai.
- [ ] `stynx-gov init` seeds `devai.config.json` from Platform defaults.
- [ ] `registerPrompts()` API merges `@stynx/*`-shipped prompts into
      host registries with dedup and schema validation.
- [ ] Reference app demonstrates the wrapper end-to-end.
- [ ] LAW-02.PLATFORM.1 capability inventory in `stech-law` already
      lists `@stynx/governance` (added via topology (b) edit).
- [ ] All Platform CI gates green (`pnpm build`, `pnpm test`,
      `pnpm lint`).

---

## Out of scope

- The actual hard-fail rule implementations (those live in devai per
  DVAI-007).
- The `devai init` command itself (devai's responsibility per
  LAW-12.BOOT.1).
- Migrating existing Domain repos (pec, porm) — separate retrofit
  spec per repo.
