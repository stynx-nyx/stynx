# pnpm Overrides

This file documents the root `pnpm.overrides` pins in `package.json`. Keep each entry tied to a removal condition so dependency-refresh work can delete overrides once upstream consumers no longer need them.

## @types/node - pinned to 25.6.0

**Reason:** Keep the root toolchain on one explicit Node type package while workspace tooling pulls mixed peer and transitive `@types/node` ranges.

**Current consumers:** Root TypeScript, ESLint, Stryker, Changesets, Jest, Drizzle, and TypeScript helper chains.

**Remove when:** All workspace tools resolve the intended Node type range through normal direct dependencies and peer ranges, or the repository changes its Node engine target and updates the direct `@types/node` dependency accordingly.

## handlebars - pinned to 4.7.9

**Reason:** CVE-2021-23369 / CVE-2021-23383 prototype-pollution hardening for transitive template consumers.

**Current consumers:** `ts-jest`, `eslint-plugin-boundaries`, `@boundaries/elements`, and `openapi-typescript-codegen`.

**Remove when:** Transitive consumers upgrade beyond the vulnerable range without the override, or the consumers no longer depend on `handlebars`.

## postcss - pinned to 8.5.12

**Reason:** Security and compatibility hardening for CSS processing across Angular, Docusaurus, Vite, and depcheck transitive paths.

**Current consumers:** `@angular/build`, Vite, css-loader, postcss-loader, Docusaurus cssnano tooling, and `@vue/compiler-sfc` through `depcheck`.

**Remove when:** Angular, Docusaurus, Vite, and depcheck resolve a maintained `postcss` release without the override and `pnpm audit --audit-level=high` remains clean.

## serialize-javascript - pinned to 7.0.5

**Reason:** Security hardening for Webpack asset serialization paths used by documentation and frontend build tooling.

**Current consumers:** Docusaurus through `copy-webpack-plugin` and `css-minimizer-webpack-plugin`, plus Angular build tooling through `copy-webpack-plugin`.

**Remove when:** Docusaurus and Angular/Webpack transitive consumers resolve a maintained `serialize-javascript` release without the override and the audit gate remains clean.

## webpackbar - pinned to 7.0.0

**Reason:** Keep Docusaurus' Webpack progress plugin on the maintained Webpack 5-compatible major used by the current documentation build.

**Current consumers:** Docusaurus bundler and Docusaurus preset/plugin chains.

**Remove when:** Docusaurus resolves a compatible maintained `webpackbar` version without the override, or Docusaurus removes the transitive dependency.
