# STYNX-NEW-002 — `@stynx/scaffold` Package

**Priority:** CRITICAL — required for `devai init` operability
**Package:** `packages/scaffold` (new)
**Source of truth:** `stech-law` LAW-03, LAW-08, LAW-10, LAW-11, LAW-12
**Run from:** `./stynx` repo root
**Status:** Proposed
**Law-Compliance:** LAW-02.PLATFORM.1, LAW-12.BOOT.1, LAW-03.ROOT.\*, LAW-11.LAYOUT.1

---

## Context

`devai init` (per LAW-12.BOOT.1) creates a compliant repo skeleton in
seconds. The mechanics — copying templates, writing front-matter,
materialising directory structure — belong in **devai**. The
**templates themselves** belong in **stynx** (Platform layer): they
encode Platform conventions (NestJS module shape, Angular package
shape, mandatory `pnpm bootstrap` script that calls `stynx-gov init`,
canonical `docker-compose.yml` for the local dev stack, etc.).

Per LAW-02.PLATFORM.1, Platform-owned scaffolds are
`@stynx/scaffold`. This spec creates that package.

---

## Goal

Create `packages/scaffold` as a new `@stynx/*` workspace package that
ships every template `devai init` writes. Templates cover:

- Root meta files (LAW-03.ROOT.1, LAW-11.META.1).
- `docs/{eng,gov,user,dev,api,refs,work}` skeleton (LAW-11.LAYOUT.2).
- `.github/workflows/*.yml` per LAW-10.NAME.1.
- `docker-compose.yml` per LAW-08.LOCAL.1.
- `Dockerfile` per LAW-10.ART.2.
- `package.json` script set per LAW-01.SCRIPTS.1.
- `tsconfig.json`, `eslint.config.mjs`, `.prettierrc` extending
  `@stynx-internal/*` shared configs.
- `commitlint.config.mjs` per LAW-13.COMMIT.1.
- `.gitignore`, `.editorconfig`, `.gitattributes`.
- `env/{dev,stage,prod}/.env.example` per LAW-08.ENVFILE.1.
- `database/ddl/` numbered DDL skeleton per LAW-05.DDL.2.
- `src/` NestJS skeleton per LAW-13.NEST.1 (runtime-host only).
- `evidence/` directory placeholder.

---

## Step 1 — Read current state

Read in full:

- `apps/reference-api/` complete directory tree (the canonical
  example).
- `stech-law/03-file-layout.md` (the binding inventory).
- `stech-law/08-environments.md` (`pnpm bootstrap`/`doctor`/`db:reset`
  contracts).
- `stech-law/11-docs.md` (`docs/` taxonomy).
- `tools/devai/templates/` (existing devai-shipped agent templates —
  these stay in devai; only Platform-aware bits move to stynx).

---

## Step 2 — Create `packages/scaffold/package.json`

```json
{
  "name": "@stynx/scaffold",
  "version": "0.1.0",
  "description": "Project templates for new repos under the stech constitution. Consumed by devai init per LAW-12.BOOT.1.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./templates/*": "./templates/*"
  },
  "files": ["dist/**", "templates/**"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "lint": "eslint src/",
    "test": "vitest run"
  },
  "engines": { "node": ">=24 <25" }
}
```

Note: no runtime dependencies. Templates are static files.

---

## Step 3 — Template directory structure

```
packages/scaffold/templates/
  runtime-host/
    package.json.tmpl
    tsconfig.json.tmpl
    eslint.config.mjs.tmpl
    .prettierrc.tmpl
    commitlint.config.mjs.tmpl
    .gitignore.tmpl
    .editorconfig.tmpl
    .gitattributes.tmpl
    docker-compose.yml.tmpl
    Dockerfile.tmpl
    README.md.tmpl
    AGENTS.md.tmpl
    GOVERNANCE.md.tmpl
    CONTEXT.md.tmpl
    MEMORY.md.tmpl
    CODESTYLE.md.tmpl       # symlink target law-13
    CONTRIBUTING.md.tmpl
    SECURITY.md.tmpl
    CHANGELOG.md.tmpl
    LICENSE.tmpl
    law-config.yaml.tmpl
    devai.config.json.tmpl  # bundled from @stynx/governance defaults
    env/
      dev/.env.example.tmpl
      stage/.env.example.tmpl
      prod/.env.example.tmpl
    docs/
      eng/README.md.tmpl
      gov/README.md.tmpl
      user/README.md.tmpl
      dev/README.md.tmpl
      api/README.md.tmpl
      refs/{reverse,legacy,archive,external}/README.md.tmpl
      work/{specs,prompts,diag,inv,plan}/README.md.tmpl
    database/
      ddl/00-extensions.sql.tmpl
      ddl/README.md.tmpl
    src/
      main.ts.tmpl
      app.module.ts.tmpl
    test/
      unit/.gitkeep
      db/.gitkeep
      api/.gitkeep
      e2e/.gitkeep
      fixtures/.gitkeep
    evidence/.gitkeep
    .github/
      workflows/
        ci.yml.tmpl
        deploy-stage.yml.tmpl
        deploy-prod.yml.tmpl
        security-scheduled.yml.tmpl
        nightly.yml.tmpl
        dependabot-auto-merge.yml.tmpl
      dependabot.yml.tmpl
      CODEOWNERS.tmpl
      pull_request_template.md.tmpl
  platform-package/
    # Same shape minus runtime-host-only files (no docker-compose,
    # no database/ddl, no env/, plus pnpm-workspace.yaml.tmpl,
    # turbo.json.tmpl, .changeset/config.json.tmpl, etc.)
  docs-archive/
    # Minimal: README, AGENTS, GOVERNANCE, LICENSE, law-config,
    # docs/{eng,refs,gov,work}/ skeleton
```

---

## Step 4 — Template variables convention

Every `.tmpl` file uses Mustache-style placeholders:

| Variable                | Example       | Source                             |
| ----------------------- | ------------- | ---------------------------------- |
| `{{project_name}}`      | `billing-api` | user prompt or git remote          |
| `{{org_name}}`          | `acme`        | org-root law-config inheritance    |
| `{{org_region}}`        | `us-east-1`   | org-root law-config inheritance    |
| `{{aws_region}}`        | `us-east-1`   | per-project override               |
| `{{author_handle}}`     | `@aarusso`    | git config                         |
| `{{adoption_date}}`     | `2026-04-26`  | run date                           |
| `{{stech_law_version}}` | `1.0.0`       | from installed `stech-law` package |
| `{{node_version}}`      | `24`          | LAW-01.NODE.1 floor                |
| `{{stynx_version}}`     | `0.5.0`       | installed Platform version         |
| `{{license_year}}`      | `2026`        | run year                           |

devai performs the substitution; scaffold provides the templates with
placeholders intact.

---

## Step 5 — `src/index.ts` programmatic API

```ts
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const templatesRoot = join(pkgRoot, 'templates');

export type ProjectType = 'runtime-host' | 'platform-package' | 'docs-archive';

/** Returns the absolute path to the templates directory for a project type. */
export function templateRoot(projectType: ProjectType): string {
  return join(templatesRoot, projectType);
}

/** Lists every template file (relative paths) for a project type. */
export function listTemplates(projectType: ProjectType): string[] {
  const root = templateRoot(projectType);
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(root, full));
    }
  };
  walk(root);
  return out.sort();
}

/** Reads a template file's raw content (with placeholders intact). */
export function readTemplate(projectType: ProjectType, relPath: string): string {
  return readFileSync(join(templateRoot(projectType), relPath), 'utf8');
}
```

devai uses this API to enumerate and read templates during `devai init`.

---

## Step 6 — Reference app sync

Per LAW-02.PROMOTE.3, the reference app demonstrates every mandatory
pattern. Conversely: the templates SHOULD be derivable from the
reference app. Add a CI step to stynx that:

1. Generates a fresh runtime-host scaffold.
2. Compares it to `apps/reference-api/`'s top-level structure.
3. Fails if templates and reference app diverge.

This keeps templates honest — the runnable example is the source of
truth.

---

## Step 7 — Tests

- `test/list-templates.test.ts` — every project type yields the
  mandatory file set per LAW-03.
- `test/read-template.test.ts` — every template file parses if it
  declares a parseable format (JSON, YAML, JS).
- `test/template-vars.test.ts` — every template variable in a file
  appears in the documented set (Step 4).
- `test/reference-sync.test.ts` — runtime-host templates produce a
  structure matching `apps/reference-api/`.

---

## Verification

```bash
pnpm --filter @stynx/scaffold build
pnpm --filter @stynx/scaffold test
pnpm --filter @stynx/scaffold lint

# Used by devai (after DVAI-007 lands):
node -e "
  const s = require('@stynx/scaffold');
  console.log(s.listTemplates('runtime-host').slice(0, 5));
"
```

---

## Acceptance criteria

- [ ] `@stynx/scaffold` is published as a workspace package.
- [ ] Templates exist for all three project types
      (runtime-host, platform-package, docs-archive).
- [ ] `listTemplates()` returns every mandatory file per LAW-03.ROOT._
      and LAW-11.LAYOUT._.
- [ ] Template variables are documented and consistent across files.
- [ ] CI gate verifies runtime-host templates match reference app
      shape.
- [ ] devai `init` (DVAI-007) consumes this package without
      modification.

---

## Out of scope

- The substitution engine (lives in devai per LAW-12.BOOT.1).
- The interactive prompts collecting variable values (devai's UX).
- Migration tooling for existing repos (separate retrofit specs).
