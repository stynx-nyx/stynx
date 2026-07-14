---
'@stynx-nyx/reference-api': patch
'@stynx-nyx/reference-web': patch
---

Wire GitHub Packages auth into each Dockerfile's internal `pnpm install`
(BuildKit secret mount, `.npmrc` copied into the build context) so image
builds can resolve `@devai-nyx/*` now that CI consumes DEVAI as published
npm packages instead of a sibling checkout (D-118).
