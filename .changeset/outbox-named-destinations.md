---
'@stynx-nyx/outbox': patch
---

Route named destinations over the entity selector (UPS-OBX-11, #320; ADR-OUTBOX-0003 D4).
`OutboxModuleOptions.destinations` registers `OutboxDestination` entries — a name, an
`OutboxEntitySelector` and an optional `OutboxDispatcherPort`. A name is accepted by
`dispatchEventsDue`, `dispatchTenantEventsDue` (filter `{ destination }`, exported as
`OutboxDispatchFilter`) and `getQueueHealth` (`destination`) in place of its selector, and the
events it matches are sent through its own port or, without one, the module `dispatcher`
(`STYNX_OUTBOX_DESTINATIONS` provider, new injection token). The registry is validated when
`OutboxService` is constructed: unique names, no entity matched by two destinations, and every
destination covered by `dispatchableEntities` when that is set; an unknown name is a `RangeError`
before any transaction. No table, column, status or stored destination is added, the
per-aggregate order is unchanged, and without a registry the behaviour of 1.5.5 is unchanged.
