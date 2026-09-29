---
'@stynx-nyx/backend': patch
'@stynx-nyx/data': patch
'@stynx-nyx/outbox': patch
'@stynx-nyx/signature': patch
---

Expose a per-statement deadline for transactional commands, add tenant-scoped
outbox dispatch and ACK under application RLS, and improve signature trust
classification for authentic unsupported PDF cross references and OCSP errors.
