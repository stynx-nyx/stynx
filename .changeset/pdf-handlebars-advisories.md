---
'@stynx-nyx/pdf': patch
---

Move the `handlebars` dependency of `@stynx-nyx/pdf` from 4.7.9 to 4.7.10, the
release that closes GHSA-8r5x-fm3f-whwj, GHSA-p8wg-vrv2-v86f and
GHSA-xw65-4hp5-5hc7 (published 2026-10-08), so a consumer installing the
package no longer resolves the vulnerable template engine. Template rendering
is unchanged.
