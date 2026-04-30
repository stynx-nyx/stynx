# GAP-002 — Dead-Code and Orphaned-Dep Detection in CI

**Priority:** MEANINGFUL  
**Package:** root tooling  
**Run from:** `./stynx` repo root

---

## Context

stynx has no CI gate for unused exports, unreferenced files, or orphaned
`package.json` dependencies. Dead code accumulates silently and orphaned deps
bloat `node_modules` without any signal until a human notices. porm gates this
with `knip` (unused exports + dead files) and `depcheck` (orphaned deps), both
CI-blocking on every PR.

---

## Goal

Add `knip` and `depcheck` to root devDependencies, wire `lint:deadcode` and
`lint:deps` scripts, register the task in `turbo.json`, and add a blocking step
to the `lint` job in CI.

---

## Step 1 — Read current state

Before writing any code, read these files in full:

- `package.json` (root)
- `turbo.json`
- `.github/workflows/ci.yml`

---

## Step 2 — Add dependencies to root `package.json`

Add to `devDependencies`:

```json
"knip": "^5.0.0",
"depcheck": "^1.4.7"
```

Add to `scripts`:

```json
"lint:deadcode": "knip",
"lint:deps":     "depcheck --ignore-patterns='**/*.test.ts,**/*.spec.ts'"
```

---

## Step 3 — Create `config/knip.config.ts`

Create `config/knip.config.ts` and run it through the root `lint:deadcode` script:

```typescript
import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  // Packages that intentionally re-export everything (barrel index files are
  // not dead just because consumers are external)
  ignoreExportsUsedInFile: true,

  workspaces: {
    '.': {
      entry: ['scripts/**/*.{ts,mjs,cjs}', 'turbo.json'],
      project: [
        'packages/**/*.ts',
        'packages-web/**/*.ts',
        'apps/**/*.ts',
        'backend/**/*.ts',
        'bootstrap/**/*.ts',
        'frontend/**/*.ts',
        'test/**/*.ts',
        'tools/**/*.ts',
      ],
    },
    'packages/*': {
      entry: ['src/index.ts'],
      project: ['src/**/*.ts'],
    },
    'packages-web/*': {
      entry: ['src/index.ts', 'src/public-api.ts'],
      project: ['src/**/*.ts'],
    },
    'apps/*': {
      entry: ['src/main.ts', 'src/app.module.ts'],
      project: ['src/**/*.ts'],
    },
  },

  ignore: [
    // Generated or vendored
    '**/dist/**',
    '**/build/**',
    '**/.turbo/**',
    // Config files that are consumed by tooling, not imported
    '*.config.{ts,js,cjs,mjs}',
    'commitlint.config.{ts,cjs}',
    '.stryker*.{json,js}',
    // Playwright test fixtures
    'test/e2e/**',
  ],
};

export default config;
```

---

## Step 4 — Register task in `turbo.json`

Add `lint:deadcode` as a task that runs after build (so exports from compiled
packages are visible):

```json
"lint:deadcode": {
  "dependsOn": ["^build"],
  "outputs": []
}
```

Place it alongside the existing `"lint"` task entry.

---

## Step 5 — Add CI step to `.github/workflows/ci.yml`

Inside the `lint` job, after the existing `Lint workspace and legacy surfaces`
step, add:

```yaml
- name: Dead-code gate (knip)
  run: pnpm lint:deadcode

- name: Orphaned-dependency gate (depcheck)
  run: pnpm lint:deps
```

---

## Verification

```bash
# Install new deps
pnpm install

# Run knip locally — review output before treating as blocking
pnpm lint:deadcode

# Run depcheck
pnpm lint:deps

# Full lint still passes
pnpm lint
```

---

## Acceptance criteria

- [ ] `knip` and `depcheck` are in root `devDependencies`
- [ ] `pnpm lint:deadcode` runs without error on a clean repo
- [ ] `pnpm lint:deps` reports zero orphaned deps
- [ ] `turbo.json` has a `lint:deadcode` task entry
- [ ] CI `lint` job blocks on both new steps
- [ ] `pnpm lint` (turbo) still passes
