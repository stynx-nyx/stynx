---
'@stynx-nyx/cli': patch
'@stynx-nyx/data': patch
'@stynx-nyx/sessions': patch
'@stynx-nyx/sdk': patch
---

Refresh minor and patch dependencies: `pg` ^8.22.0 (`@stynx-nyx/cli`,
`@stynx-nyx/data`), `uuid` ^14.0.1
(`@stynx-nyx/sessions`; the workspace override moves to 14.0.1 so the bump
takes effect), and `openapi-typescript-codegen` ^0.31.0 (`@stynx-nyx/sdk`).
