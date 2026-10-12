---
'@stynx-nyx/sessions': minor
'@stynx-nyx/auth': patch
---

Add validated active-session admission for built-in authentication guards, preserving legacy session reads. Definitively inactive sessions use the optional public actor or receive the protected-route denial; malformed state and infrastructure failures propagate. Return the documented forbidden response when an authenticated user lacks active tenant membership.
