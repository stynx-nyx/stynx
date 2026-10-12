---
'@stynx-nyx/privacy': minor
---

Require authenticated tenant permissions for privacy HTTP operations, isolate exports,
erasures and retention to admitted tenants, and reserve global administration for
explicit internal SystemContext callers. Use HMAC pseudonyms and spreadsheet-safe CSV.
