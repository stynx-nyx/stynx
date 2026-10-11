---
'@stynx-nyx/storage': minor
'@stynx-nyx/privacy': patch
---

Expose idempotent object-store disposal and close owned S3 clients during Nest
application shutdown. Refuse object-store operations after successful disposal
and allow cleanup to be retried when the underlying client throws.
