---
---

No release: 2026-07 consolidated dependency round. Touches only non-publishable
surfaces — reference/api, reference/web, test/db, test/packages package.json
(typescript/@types/node bumps), root pnpm.overrides (esbuild, @types/node
scoping), scripts/check-engines.mjs (directory-scoped version exceptions),
docs/site/package.json (@mermaid-js/layout-elk), test/packages/pnpm-lock.yaml
(stray standalone lockfile regenerated to clear Dependabot alerts), and
.github/workflows/ci.yml (mikepenz/action-junit-report). No packages/_ or
packages-web/_ dependency, source, or version changes; published artifacts
are unaffected.
