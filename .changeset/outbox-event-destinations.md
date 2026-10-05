---
'@stynx-nyx/outbox': patch
---

Add event-mode destinations to the outbox (UPS-OBX-07).
`OutboxModuleOptions.dispatchableEntities` takes an `OutboxEntitySelector`
(`entities` for exact names, `entityPrefixes` for literal prefixes). When it is
set, `appendInTransaction` and `appendManyInTransaction` create a delivery row
only for an event whose `entity` matches; any other event is written to the log
alone, so it is never claimed, never sent, has no attempt row, is not counted by
`getQueueHealth` and never blocks a later event of its aggregate. Event ids,
`created_at`, idempotency and `OutboxEventStreamSource` are unchanged.
`dispatchEventsDue` and `dispatchTenantEventsDue` accept an optional entity
filter as a second argument, so each destination can be drained by its own
sweep. Without the option and without a filter the behavior is that of 1.5.3;
no migration is required.
